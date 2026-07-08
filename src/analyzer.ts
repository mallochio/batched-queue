import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Api, Message, Model, Tool, ToolCall } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { ActionBatchPayload } from "./payload.js";
import type { ResolvedBatchQueueConfig } from "./config.js";
import { createSubmitActionBatchToolSchema, QueueActionSchema } from "./schemas.js";
import { parseActionBatchPayload } from "./guards.js";
import { resolvePlanningModelRef } from "./planning-model.js";

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

export function analyzerSystemPrompt(config: ResolvedBatchQueueConfig): string {
	const mutationGuidance = config.allowObjectiveMutations
		? [
			"Mutate only when the objective clearly requires it.",
			"- apply_diff: { type, path, oldText, newText, replaceAll? }",
		]
		: [
			"Do not plan mutating actions. Objective mode is read/check-only; omit apply_diff.",
		];

	return [
		"You are the batch planner for a coding agent.",
		"Given an objective, emit a sequential action batch as JSON via the submit_action_batch tool.",
		"Plan up to the configured maximum of low-risk sequential repo actions for inspect/search/check loops whenever possible.",
		"Use deterministic actions: read/grep before shell.",
		...mutationGuidance,
		"Do not plan destructive, long-running, interactive, or approval-sensitive commands.",
		"Available action types:",
		"- read_lines: { type, path, startLine?, endLine? }",
		"- grep_pattern: { type, pattern, path?, glob?, caseSensitive?, literal?, contextLines? }",
		"- execute_bash: { type, command, timeoutMs? }",
		"Order actions so each step can rely on prior shell state (cwd/env persist for execute_bash).",
		"Keep batches concise and actionable; stop once enough context or verification is gathered.",
	].join("\n");
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
	const userMessage: Message = {
		role: "user",
		content: [{ type: "text", text: objective }],
		timestamp: Date.now(),
	};

	const complete = await resolveCompleteImplementation();
	const response = await complete(
		planningModel,
		{
			systemPrompt: analyzerSystemPrompt(config),
			messages: [userMessage],
			tools: [buildSubmitBatchTool(config)],
		},
		{
			apiKey: auth.apiKey,
			headers: auth.headers,
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

	const payload = extractBatchFromResponse(response, config.maxBatchActions);
	assertObjectiveMutationPolicy(payload, config);
	return payload;
}

export function createBatchQueueToolParameters(maxBatchActions: number) {
	return Type.Object({
		objective: Type.Optional(
			Type.String({
				description:
					"Use when the goal is clear but enumerating steps is tedious; the session driver plans by default, or a configured cheap execution model when set.",
			}),
		),
		actions: Type.Optional(
			Type.Array(QueueActionSchema, {
				minItems: 1,
				maxItems: maxBatchActions,
				description:
					"Pre-planned action batch from the session driver / planner. Preferred when the exact deterministic reads, searches, checks, or edits are already known; skips objective planning.",
			}),
		),
		batchId: Type.Optional(
			Type.String({
				description: "Stable label for logging and debugging; not semantically important.",
			}),
		),
	});
}
