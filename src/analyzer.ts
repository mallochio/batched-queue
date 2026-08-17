import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Api, Message, Model, Tool, ToolCall, Usage } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { ActionBatchPayload } from "./payload.js";
import type { ResolvedBatchQueueConfig } from "./config.js";
import {
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
import type { PlannerUsage, PlannerUsageAccumulator } from "./planner-usage.js";
import { addPlannerUsage, emptyPlannerUsage, finalizePlannerUsage } from "./planner-usage.js";

/** @deprecated Pass ModelRegistry directly to analyzeBatchObjective. */
export type BatchAnalyzerContext = ModelRegistry;

interface CompleteResponse {
	readonly stopReason?: string;
	readonly errorMessage?: string;
	readonly content: ({ type: string } | ToolCall)[];
	readonly usage?: Usage;
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
		throw new Error("pi-ai compat module does not export complete()");
	}
	return compatModule.complete;
}

/**
 * Host packages that may provide complete(), in preference order.
 *
 * Pi ships `@earendil-works/pi-ai`; Oh My Pi ships `@oh-my-pi/pi-ai`. Probing
 * both keeps one extension build working on either harness.
 *
 * The specifiers must stay as literals inside `import()` calls. Oh My Pi never
 * installs these packages on disk — its loader rewrites literal import
 * specifiers onto host-bundled copies, so `import.meta.resolve` and
 * `require.resolve` both fail there. A computed specifier would skip the
 * rewrite and fail the same way.
 */
const PI_AI_LOADERS: ReadonlyArray<{
	readonly specifier: string;
	readonly load: () => Promise<unknown>;
}> = [
	{
		specifier: "@earendil-works/pi-ai",
		load: () => import("@earendil-works/pi-ai"),
	},
	{
		specifier: "@oh-my-pi/pi-ai",
		// @ts-expect-error Oh My Pi injects this host package at load time; it is
		// deliberately absent from this package's dependencies.
		load: () => import("@oh-my-pi/pi-ai"),
	},
];

const PI_AI_SPECIFIERS = PI_AI_LOADERS.map(loader => loader.specifier);

async function resolvePiAiEntrypointUrl(): Promise<string> {
	const failures: string[] = [];
	for (const specifier of PI_AI_SPECIFIERS) {
		try {
			if (typeof import.meta.resolve === "function") {
				return import.meta.resolve(specifier);
			}
			return pathToFileURL(require.resolve(specifier)).href;
		} catch (error) {
			failures.push(`${specifier}: ${(error as Error).message}`);
		}
	}
	throw new Error(`cannot resolve a pi-ai host module (${failures.join("; ")})`);
}

export async function resolveCompleteImplementation(): Promise<CompleteImplementation> {
	completeImplementationPromise ??= (async () => {
		const failures: string[] = [];
		for (const { specifier, load } of PI_AI_LOADERS) {
			try {
				const piAiModule = await load();
				if (isCompleteModule(piAiModule)) {
					return piAiModule.complete;
				}
				failures.push(`${specifier}: no complete() export`);
			} catch (error) {
				failures.push(`${specifier}: ${(error as Error).message}`);
			}
		}

		// Pi 0.80 moved complete() to a compat entrypoint, but some Pi loaders
		// misresolve static subpath imports from TypeScript extensions. Import the
		// sibling dist file by absolute URL so both old root exports and newer
		// compat-only packages load reliably.
		try {
			return await importCompatCompleteFromDist();
		} catch (error) {
			failures.push(`compat dist: ${(error as Error).message}`);
		}
		throw new Error(`cannot resolve a pi-ai host module (${failures.join("; ")})`);
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
				"Then output the JSON batch object. Do not inspect once you have enough context.",
			]
			: [];

	const reflectionGuidance = config.requirePlanReflection
		? [
			"Attach a `reflection` object when submitting: confidence (integer 0-5), successCriteria, risks, and optional fallback.",
			"Use confidence 3 or below when the objective is ambiguous or insufficiently grounded; in that case prefer a smaller read/check batch over speculative shell commands.",
		]
		: [];

	return [
		"You are the batch planner for a coding agent.",
		"When ready to plan, output ONLY a valid JSON object with the batch. No prose, no markdown, no commentary.",
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
		"Output format — a single JSON object:",
		'{"actions":[{"type":"read_lines","path":"..."},{"type":"execute_bash","command":"..."}],"rationale":"...","reflection":{"confidence":4,"successCriteria":"...","risks":["..."],"fallback":"..."}}',
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

function plannerJsonReminder(): Message {
	return {
		role: "user",
		content: [{ type: "text", text: "Return ONLY the JSON batch object now. No prose, no markdown, no explanation." }],
		timestamp: Date.now(),
	} as Message;
}

function finalJsonSystemPrompt(config: ResolvedBatchQueueConfig): string {
	const allowedActions = config.allowObjectiveMutations
		? "read_lines, grep_pattern, execute_bash, apply_diff"
		: "read_lines, grep_pattern, execute_bash";
	return [
		"You are emitting the final action batch for a coding agent.",
		"Return ONLY valid JSON. No markdown, no prose, no comments.",
		'{"actions":[{"type":"read_lines","path":"src/example.ts"}],"rationale":"inspect example","reflection":{"confidence":4,"successCriteria":"example inspected","risks":[],"fallback":"use explicit actions"}}',
		`Allowed action types: ${allowedActions}.`,
		config.allowObjectiveMutations
			? "Mutate only when the objective clearly requires it."
			: "Do not use apply_diff; objective mode is read/check-only.",
		config.requirePlanReflection
			? "Include reflection with confidence, successCriteria, risks, and optional fallback."
			: "Reflection is optional.",
	].join("\n");
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
			{ type: "read_lines", path: typeof args.path === "string" ? args.path : "", startLine: args.startLine as number | undefined, endLine: args.endLine as number | undefined },
			0,
			{ workspaceRoot: cwd, gitWorkspaceRoot: gitRoot, limits: DEFAULT_OUTPUT_LIMITS },
		);
		return result.success ? result.formatted || "(empty)" : `error: ${result.error}`;
	}
	const result = await executeGrepPattern(
		{
			type: "grep_pattern",
			pattern: typeof args.pattern === "string" ? args.pattern : "",
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

/**
 * Extract a batch JSON payload from the model's text response.
 * Tries direct parse, code blocks, and balanced-brace extraction.
 */
function extractBatchFromText(text: string): unknown {
	const trimmed = text.trim();
	if (!trimmed) return undefined;

	// Direct JSON
	if (trimmed.startsWith("{")) {
		try { return JSON.parse(trimmed); } catch { /* not pure JSON */ }
	}

	// Code block
	const codeBlockMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
	if (codeBlockMatch?.[1]) {
		try { return JSON.parse(codeBlockMatch[1].trim()); } catch { /* not JSON */ }
	}

	// Balanced brace extraction
	const start = trimmed.indexOf("{");
	const end = trimmed.lastIndexOf("}");
	if (start !== -1 && end > start) {
		try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { /* not JSON */ }
	}

	return undefined;
}

export function assertObjectiveMutationPolicy(
	payload: ActionBatchPayload,
	config: ResolvedBatchQueueConfig,
): void {
	if (config.allowObjectiveMutations) {
		return;
	}

	const hasMutation = payload.actions.some((action) => action.type === "apply_diff");
	if (hasMutation) {
		throw new Error("objective-planned apply_diff is disabled; pass explicit actions or enable allowObjectiveMutations");
	}
}

/**
 * Resolve the planning model, tolerating custom provider deployment ids that are
 * absent from the static model catalog (e.g. Azure OpenAI deployment names).
 *
 * Pi already fully resolves the driver model from the active session, so when the
 * planner is the driver we reuse it directly; when a configured executor targets a
 * custom deployment on the same provider we clone the driver's transport config
 * (baseUrl, api, compat, auth provider) and only swap the model id.
 *
 * The clone disables reasoning: a custom deployment's reasoning-continuity support
 * is unknown, and some (e.g. non-OpenAI models served via Azure OpenAI, such as
 * grok) reject the `reasoning.encrypted_content` include that Pi sends for reasoning
 * models, which would otherwise hard-fail every planner request.
 */
export function resolvePlanningModel(
	planningRef: { readonly provider: string; readonly id: string },
	driverModel: Model<Api>,
	modelRegistry: ModelRegistry,
	customEndpoint?: { readonly baseUrl?: string },
): Model<Api> {
	const found = modelRegistry.find(planningRef.provider, planningRef.id);
	if (found) {
		if (customEndpoint?.baseUrl) {
			return { ...found, baseUrl: customEndpoint.baseUrl };
		}
		return found;
	}

	if (planningRef.provider === driverModel.provider) {
		if (planningRef.id === driverModel.id && !customEndpoint?.baseUrl) {
			return driverModel;
		}
		return {
			...driverModel,
			id: planningRef.id,
			name: planningRef.id,
			baseUrl: customEndpoint?.baseUrl ?? driverModel.baseUrl,
			reasoning: false,
		};
	}

	if (customEndpoint?.baseUrl) {
		return {
			id: planningRef.id,
			name: planningRef.id,
			api: "openai-completions",
			provider: planningRef.provider as Model<Api>["provider"],
			baseUrl: customEndpoint.baseUrl,
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 128_000,
			maxTokens: 16_384,
		};
	}

	throw new Error(
		`planning model not found: ${planningRef.provider}/${planningRef.id}`,
	);
}

/**
 * Plans a batch from an objective using the session driver / planner model by default,
 * or the configured cheap execution model when set.
 */
export interface PlannerBatchResult {
	readonly payload: ActionBatchPayload;
	readonly plannerUsage: PlannerUsage;
}

export async function analyzeBatchObjective(
	objective: string,
	driverModel: Model<Api>,
	modelRegistry: ModelRegistry,
	config: ResolvedBatchQueueConfig,
	cwd: string,
	signal?: AbortSignal,
): Promise<PlannerBatchResult> {
	const planningRef = resolvePlanningModelRef(
		{ provider: driverModel.provider, id: driverModel.id },
		config,
	);
	const planningModel: Model<Api> = resolvePlanningModel(
		planningRef,
		driverModel,
		modelRegistry,
		config.executorBaseUrl ? { baseUrl: config.executorBaseUrl } : undefined,
	);

	const auth = await modelRegistry.getApiKeyAndHeaders(planningModel);
	const apiKey = config.executorApiKey ?? (auth.ok ? auth.apiKey : undefined);
	const headers = auth.ok ? auth.headers : undefined;
	if (!apiKey && !auth.ok) {
		throw new Error(auth.error);
	}
	const usageAccumulator = emptyPlannerUsage(planningRef.provider, planningRef.id);
	const complete = await resolveCompleteImplementation();
	const payload = await planBatchWithGrounding({
		objective,
		config,
		cwd,
		complete: (context, options) => complete(planningModel, context, { apiKey, headers, ...options }),
		runInspect: (name, args) => runInspectTool(name, args, cwd),
		signal,
		usageAccumulator,
	});
	return { payload, plannerUsage: finalizePlannerUsage(usageAccumulator) };
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
	/** Optional accumulator for planner model usage across grounding and final calls. */
	readonly usageAccumulator?: PlannerUsageAccumulator;
}

/**
 * Plans a batch, optionally letting the model ground itself with read/grep
 * inspect calls before it must submit. Pure w.r.t. IO: `complete` and
 * `runInspect` are injected so this is unit-testable.
 */
export async function planBatchWithGrounding(deps: PlanBatchDeps): Promise<ActionBatchPayload> {
	const { objective, config, complete, runInspect, signal } = deps;
	const grounding = config.groundingTurns > 0;
	const inspectTools: Tool[] = grounding
		? [INSPECT_READ_TOOL, INSPECT_GREP_TOOL]
		: [];

	const messages: Message[] = [
		{ role: "user", content: [{ type: "text", text: objective }], timestamp: Date.now() },
	];

	const systemPrompt = analyzerSystemPrompt(config, grounding);
	for (let turn = 0; turn <= config.groundingTurns + 1; turn += 1) {
		const retryTurn = turn > config.groundingTurns;
		const lastTurn = turn >= config.groundingTurns;
		const turnTools = lastTurn ? [] : inspectTools;
		const turnMessages = lastTurn && !retryTurn ? [...messages, plannerJsonReminder()] : messages;
		const response = await complete(
			{ systemPrompt: lastTurn ? finalJsonSystemPrompt(config) : systemPrompt, messages: turnMessages, tools: turnTools },
			{
				signal,
				...(turnTools.length > 0 ? { toolChoice: "auto" as const } : {}),
				...(config.executorThinking ? { reasoningEffort: config.executorThinking } : {}),
			},
		);

		if (deps.usageAccumulator && response.usage) {
			addPlannerUsage(deps.usageAccumulator, response.usage);
		}

		if (response.stopReason === "aborted") {
			throw new Error("batch analysis aborted");
		}
		if (response.stopReason === "error") {
			throw new Error(response.errorMessage ?? "planning model request failed");
		}

		// Check for submit_action_batch tool call (backward compat with models that prefer tool calls).
		const toolCalls = response.content.filter(
			(entry): entry is ToolCall => entry.type === "toolCall" && "name" in entry,
		);
		const submit = toolCalls.find((call) => call.name === "submit_action_batch");
		if (submit) {
			const payload = parseActionBatchPayload(submit.arguments, config.maxBatchActions);
			assertObjectiveMutationPolicy(payload, config);
			return payload;
		}

		// Extract JSON batch from text response.
		const textContent = response.content
			.filter((entry): entry is { type: string; text: string } =>
				"text" in entry && typeof (entry as { text?: unknown }).text === "string")
			.map((entry) => entry.text)
			.join("");
		const jsonPayload = extractBatchFromText(textContent);
		if (jsonPayload !== undefined) {
			const payload = parseActionBatchPayload(jsonPayload, config.maxBatchActions);
			assertObjectiveMutationPolicy(payload, config);
			return payload;
		}

		// No batch yet — process inspect tool calls for grounding.
		const inspects = toolCalls.filter(
			(call) => call.name === "inspect_read" || call.name === "inspect_grep",
		);
		if (inspects.length > 0 && !lastTurn) {
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
			continue;
		}

		if (lastTurn) {
			const summary = summarizePlannerContent(response);
			if (!retryTurn) {
				messages.push({ role: "assistant", content: response.content } as Message);
				messages.push(plannerJsonReminder());
				continue;
			}
			throw new Error(`planning model did not return a batch plan (got ${summary}); try explicit actions, a smaller objective, or a stronger BATCH_QUEUE_EXECUTOR`);
		}

		// No inspects and no batch — advance to next turn.
		messages.push({ role: "assistant", content: response.content } as Message);
	}

	throw new Error("planning model did not return a batch plan; try explicit actions, a smaller objective, or a stronger BATCH_QUEUE_EXECUTOR");
}

export function createBatchQueueToolParameters(maxBatchActions: number) {
	return Type.Object({
		objective: Type.Optional(
			Type.String({
				description:
					"Describe a multi-step repo task (e.g. 'read config.ts, find where defaults load, run its test') and batch_queue plans and runs safe sequential read/grep/bash steps.",
			}),
		),
		actions: Type.Optional(
			Type.Array(QueueActionSchema, {
				minItems: 1,
				maxItems: maxBatchActions,
				description:
					"Pass the exact typed action sequence. Preferred for edits/apply_diff or when the steps are known. Each step can use a prior step's result via bindTo/${name}.",
			}),
		),
		batchId: Type.Optional(
			Type.String({
				description: "Stable label for logging and debugging; not semantically important.",
			}),
		),
	});
}
