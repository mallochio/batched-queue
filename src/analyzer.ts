import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Api, Message, Model, Tool, ToolCall } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { ActionBatchPayload } from "./payload.js";
import type { ResolvedBatchQueueConfig } from "./config.js";
import {
	createSubmitActionBatchToolSchema,
	GrepPatternActionSchema,
	ReadLinesActionSchema,
	QueueActionSchema,
} from "./schemas.js";
import { parseActionBatchPayload } from "./guards.js";
import { resolvePlanningModelRef } from "./planning-model.js";
import { executeReadLines } from "./executors/read-lines.js";
import { executeGrepPattern } from "./executors/grep-pattern.js";
import { DEFAULT_OUTPUT_LIMITS, DEFAULT_COMMAND_TIMEOUT_MS } from "./constants.js";
import { findWorkspaceRoot } from "./lib/path-security.js";

/** @deprecated Pass ModelRegistry directly to analyzeBatchObjective. */
export type BatchAnalyzerContext = ModelRegistry;

interface CompleteResponse {
	readonly stopReason?: string;
	readonly errorMessage?: string;
	readonly content: ({ type: string } | ToolCall)[];
}

type CompleteImplementation = (
	model: Model<Api>,
	context: {
		readonly systemPrompt: string;
		readonly messages: readonly Message[];
		readonly tools: readonly Tool[];
	},
	options: {
		readonly apiKey?: string;
		readonly headers?: Record<string, string>;
		readonly signal?: AbortSignal;
		readonly toolChoice?: string;
		readonly reasoningEffort?: string;
	},
) => Promise<CompleteResponse>;

const require = createRequire(import.meta.url);
let completeImplementationPromise: Promise<CompleteImplementation> | undefined;

function isCompleteModule(value: unknown): value is { complete: CompleteImplementation } {
	return (
		typeof value === "object" &&
		value !== null &&
		"complete" in value &&
		typeof (value as { complete: unknown }).complete === "function"
	);
}

async function importCompatCompleteFromDist(): Promise<CompleteImplementation> {
	const piAiEntrypointUrl = await resolvePiAiEntrypointUrl();
	const compatUrl = pathToFileURL(
		join(dirname(fileURLToPath(piAiEntrypointUrl)), "compat.js"),
	).href;
	const compatModule = await import(compatUrl);
	if (!isCompleteModule(compatModule)) {
		throw new Error("@earendil-works/pi-ai compat module does not export complete()");
	}
	return compatModule.complete;
}

async function resolvePiAiEntrypointUrl(): Promise<string> {
	if (typeof import.meta.resolve === "function") {
		return import.meta.resolve("@earendil-works/pi-ai");
	}
	return pathToFileURL(require.resolve("@earendil-works/pi-ai")).href;
}

export async function resolveCompleteImplementation(): Promise<CompleteImplementation> {
	completeImplementationPromise ??= (async () => {
		const piAiModule = await import(await resolvePiAiEntrypointUrl());
		if (isCompleteModule(piAiModule)) {
			return piAiModule.complete;
		}

		// Pi 0.80 moved complete() to a compat entrypoint, but some Pi loaders
		// misresolve static subpath imports from TypeScript extensions. Import the
		// sibling dist file by absolute URL so both old root exports and newer
		// compat-only packages load reliably.
		return importCompatCompleteFromDist();
	})();
	return completeImplementationPromise;
}

/**
 * @param withGrounding When true, include guidance for the inspect_read/inspect_grep
 * tools. Only the Pi tool-loop path offers those tools; the OpenCode structured-output
 * path must not advertise them.
 */
export function analyzerSystemPrompt(
	config: ResolvedBatchQueueConfig,
	withGrounding = false,
): string {
	const mutationGuidance = config.allowObjectiveMutations
		? [
			"Mutate only when the objective clearly requires it.",
			"- apply_diff: { type, path, oldText, newText, replaceAll? }",
		]
		: [
			"Do not plan mutating actions. Objective mode is read/check-only; omit apply_diff.",
		];

	const groundingGuidance =
		withGrounding && config.groundingTurns > 0
			? [
				`Ground before planning: you may call inspect_read and inspect_grep up to ${config.groundingTurns} times to look at the real repo first.`,
				"Inspect only enough to plan accurately, then call submit_action_batch. Do not inspect once you have enough context.",
			]
			: [];

	const reflectionGuidance = config.requirePlanReflection
		? [
			"Attach a `reflection` object when submitting: confidence (0-1), successCriteria, risks, and optional fallback.",
			"Use confidence below 0.7 when the objective is ambiguous or insufficiently grounded; in that case prefer a smaller read/check batch over speculative shell commands.",
		]
		: [];

	return [
		"You are the batch planner for a coding agent.",
		"You must call a tool; do not answer in prose or markdown.",
		"When ready to plan, call exactly one submit_action_batch tool with the JSON batch.",
		...groundingGuidance,
		"Plan the smallest batch that accomplishes the objective. Prefer short batches (3-5 actions) so the agent re-observes and adapts; only plan more when the extra steps are clearly needed.",
		"Use deterministic actions: read/grep before shell.",
		...mutationGuidance,
		"Do not plan destructive, long-running, interactive, or approval-sensitive commands.",
		"Available action types:",
		"- read_lines: { type, path, startLine?, endLine?, bindTo? }",
		"- grep_pattern: { type, pattern, path?, glob?, caseSensitive?, literal?, contextLines?, bindTo? }",
		"- execute_bash: { type, command, timeoutMs?, bindTo? }",
		"Each action is a typed function call: optionally name its returned observation with bindTo, then reference prior observations in later string fields as ${name}.",
		"Reference only variables bound by earlier actions; quote interpolated values carefully in shell commands because substitutions are raw text.",
		"Order actions so each step can rely on prior shell state (cwd/env persist for execute_bash).",
		"Keep batches concise and actionable; stop once enough context or verification is gathered.",
		...reflectionGuidance,
	].join("\n");
}

function summarizePlannerContent(response: CompleteResponse): string {
	const parts = response.content.map((entry) => {
		if (entry.type === "toolCall" && "name" in entry) {
			return `tool:${entry.name}`;
		}
		return entry.type;
	});
	return parts.length > 0 ? parts.join(", ") : "empty response";
}

function plannerSubmitReminder(): Message {
	return {
		role: "user",
		content: [{ type: "text", text: "You must call submit_action_batch now. Do not reply with text." }],
		timestamp: Date.now(),
	} as Message;
}

function buildSubmitBatchTool(config: ResolvedBatchQueueConfig): Tool {
	return {
		name: "submit_action_batch",
		description: "Submit the planned sequential action batch for execution.",
		parameters: createSubmitActionBatchToolSchema(config.maxBatchActions, {
			allowMutatingActions: config.allowObjectiveMutations,
		}),
	};
}

const INSPECT_READ_TOOL: Tool = {
	name: "inspect_read",
	description: "Read lines from a repo file to ground your plan. Does not execute the batch.",
	parameters: ReadLinesActionSchema,
};

const INSPECT_GREP_TOOL: Tool = {
	name: "inspect_grep",
	description: "Search the repo with ripgrep to ground your plan. Does not execute the batch.",
	parameters: GrepPatternActionSchema,
};

/** Runs a read/grep inspect tool call against the real workspace, read-only. */
async function runInspectTool(
	name: string,
	args: Record<string, unknown>,
	cwd: string,
): Promise<string> {
	const gitRoot = findWorkspaceRoot(cwd);
	if (name === "inspect_read") {
		const result = executeReadLines(
			{ type: "read_lines", path: String(args.path ?? ""), startLine: args.startLine as number | undefined, endLine: args.endLine as number | undefined },
			0,
			{ workspaceRoot: cwd, gitWorkspaceRoot: gitRoot, limits: DEFAULT_OUTPUT_LIMITS },
		);
		return result.success ? result.formatted || "(empty)" : `error: ${result.error}`;
	}
	const result = await executeGrepPattern(
		{
			type: "grep_pattern",
			pattern: String(args.pattern ?? ""),
			path: args.path as string | undefined,
			glob: args.glob as string | undefined,
			caseSensitive: args.caseSensitive as boolean | undefined,
			literal: args.literal as boolean | undefined,
			contextLines: args.contextLines as number | undefined,
		},
		0,
		{ workspaceRoot: cwd, gitWorkspaceRoot: gitRoot, limits: DEFAULT_OUTPUT_LIMITS, defaultTimeoutMs: DEFAULT_COMMAND_TIMEOUT_MS },
	);
	if (!result.success) return `error: ${result.error}`;
	return result.matches.map((m) => `${m.path}:${m.lineNumber}: ${m.text}`).join("\n") || "(no matches)";
}

function extractBatchFromResponse(
	response: { content: ({ type: string } | ToolCall)[] },
	maxBatchActions: number,
): ActionBatchPayload {
	const toolCall = response.content.find(
		(entry): entry is ToolCall =>
			entry.type === "toolCall" &&
			"name" in entry &&
			entry.name === "submit_action_batch",
	);
	if (!toolCall) {
		throw new Error("planning model did not return submit_action_batch");
	}

	return parseActionBatchPayload(toolCall.arguments, maxBatchActions);
}

export function assertObjectiveMutationPolicy(
	payload: ActionBatchPayload,
	config: ResolvedBatchQueueConfig,
): void {
	if (config.allowObjectiveMutations) {
		return;
	}

	const mutation = payload.actions.find((action) => action.type === "apply_diff");
	if (mutation) {
		throw new Error("objective-planned apply_diff is disabled; pass explicit actions or enable allowObjectiveMutations");
	}
}

/**
 * Plans a batch from an objective using the session driver / planner model by default,
 * or the configured cheap execution model when set.
 */
export async function analyzeBatchObjective(
	objective: string,
	driverModel: Model<Api>,
	modelRegistry: ModelRegistry,
	config: ResolvedBatchQueueConfig,
	cwd: string,
	signal?: AbortSignal,
): Promise<ActionBatchPayload> {
	const planningRef = resolvePlanningModelRef(
		{ provider: driverModel.provider, id: driverModel.id },
		config,
	);
	const planningModel: Model<Api> | undefined = modelRegistry.find(
		planningRef.provider,
		planningRef.id,
	);

	if (!planningModel) {
		throw new Error(
			`planning model not found: ${planningRef.provider}/${planningRef.id}`,
		);
	}

	const auth = await modelRegistry.getApiKeyAndHeaders(planningModel);
	if (!auth.ok) {
		throw new Error(auth.error);
	}
	const complete = await resolveCompleteImplementation();
	return planBatchWithGrounding({
		objective,
		config,
		cwd,
		complete: (context, options) => complete(planningModel, context, { apiKey: auth.apiKey, headers: auth.headers, ...options }),
		runInspect: (name, args) => runInspectTool(name, args, cwd),
		signal,
	});
}

export interface PlanBatchDeps {
	readonly objective: string;
	readonly config: ResolvedBatchQueueConfig;
	readonly cwd: string;
	readonly complete: (
		context: { systemPrompt: string; messages: readonly Message[]; tools: readonly Tool[] },
		options: { signal?: AbortSignal; toolChoice?: string; reasoningEffort?: string },
	) => Promise<CompleteResponse>;
	readonly runInspect: (name: string, args: Record<string, unknown>) => Promise<string>;
	readonly signal?: AbortSignal;
}

/**
 * Plans a batch, optionally letting the model ground itself with read/grep
 * inspect calls before it must submit. Pure w.r.t. IO: `complete` and
 * `runInspect` are injected so this is unit-testable.
 */
export async function planBatchWithGrounding(deps: PlanBatchDeps): Promise<ActionBatchPayload> {
	const { objective, config, complete, runInspect, signal } = deps;
	const submitTool = buildSubmitBatchTool(config);
	const grounding = config.groundingTurns > 0;
	const tools: Tool[] = grounding
		? [INSPECT_READ_TOOL, INSPECT_GREP_TOOL, submitTool]
		: [submitTool];

	const messages: Message[] = [
		{ role: "user", content: [{ type: "text", text: objective }], timestamp: Date.now() },
	];

	const systemPrompt = analyzerSystemPrompt(config, grounding);
	// One request per grounding turn, plus one retry if the model replies without a usable tool call.
	let badResponseSummary = "empty response";
	for (let turn = 0; turn <= config.groundingTurns + 1; turn += 1) {
		const retryTurn = turn > config.groundingTurns;
		const lastTurn = turn >= config.groundingTurns;
		const response = await complete(
			{ systemPrompt, messages, tools: lastTurn ? [submitTool] : tools },
			{
				signal,
				toolChoice: "any",
				...(config.executorThinking ? { reasoningEffort: config.executorThinking } : {}),
			},
		);

		if (response.stopReason === "aborted") {
			throw new Error("batch analysis aborted");
		}
		if (response.stopReason === "error") {
			throw new Error(response.errorMessage ?? "planning model request failed");
		}

		const toolCalls = response.content.filter(
			(entry): entry is ToolCall => entry.type === "toolCall" && "name" in entry,
		);
		const submit = toolCalls.find((call) => call.name === "submit_action_batch");
		if (submit) {
			const payload = parseActionBatchPayload(submit.arguments, config.maxBatchActions);
			assertObjectiveMutationPolicy(payload, config);
			return payload;
		}

		const inspects = retryTurn || lastTurn ? [] : toolCalls.filter(
			(call) => call.name === "inspect_read" || call.name === "inspect_grep",
		);
		if (inspects.length === 0) {
			badResponseSummary = summarizePlannerContent(response);
			if (!retryTurn) {
				messages.push({ role: "assistant", content: response.content } as Message);
				messages.push(plannerSubmitReminder());
				continue;
			}
			throw new Error(`planning model did not return submit_action_batch (got ${badResponseSummary}); try explicit actions, a smaller objective, or a stronger BATCH_QUEUE_EXECUTOR`);
		}

		messages.push({ role: "assistant", content: response.content } as Message);
		for (const call of inspects) {
			const text = await runInspect(call.name, call.arguments);
			messages.push({
				role: "toolResult",
				toolCallId: call.id,
				toolName: call.name,
				content: [{ type: "text", text }],
				isError: false,
				timestamp: Date.now(),
			} as Message);
		}
	}

	throw new Error(`planning model did not return submit_action_batch (got ${badResponseSummary}); try explicit actions, a smaller objective, or a stronger BATCH_QUEUE_EXECUTOR`);
}

export function createBatchQueueToolParameters(maxBatchActions: number) {
	return Type.Object({
		objective: Type.Optional(
			Type.String({
				description:
					"Default for 2+ dependent repo steps. Describe the multi-step task; batch_queue plans and runs a safe sequential read/check action batch. Do not use for one obvious command.",
			}),
		),
		actions: Type.Optional(
			Type.Array(QueueActionSchema, {
				minItems: 1,
				maxItems: maxBatchActions,
				description:
					"Advanced escape hatch. Use only for 2+ exact ordered actions, mutation/apply_diff, or continuing after a failed batch; skips objective planning. Do not wrap one obvious command.",
			}),
		),
		batchId: Type.Optional(
			Type.String({
				description: "Stable label for logging and debugging; not semantically important.",
			}),
		),
	});
}
