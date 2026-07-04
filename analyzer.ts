import { complete, type Api, type Message, type Model, type Tool, type ToolCall } from "@mariozechner/pi-ai";
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { ActionBatchPayload } from "./payload.js";
import type { ResolvedBatchQueueConfig } from "./config.js";
import { createSubmitActionBatchToolSchema, QueueActionSchema } from "./schemas.js";
import { parseActionBatchPayload } from "./guards.js";

/** @deprecated Pass ModelRegistry directly to analyzeBatchObjective. */
export type BatchAnalyzerContext = ModelRegistry;

const ANALYZER_SYSTEM_PROMPT = [
	"You are the batch executor for a coding agent.",
	"Given an objective, emit a sequential action batch as JSON via the submit_action_batch tool.",
	"Plan 2-5 low-risk sequential repo actions for inspect/search/check loops whenever possible.",
	"Use deterministic actions: read/grep before shell, shell before mutation, and mutate only when the objective clearly requires it.",
	"Do not plan destructive, long-running, interactive, or approval-sensitive commands.",
	"Available action types:",
	"- read_lines: { type, path, startLine?, endLine? }",
	"- grep_pattern: { type, pattern, path?, glob?, caseSensitive?, literal?, contextLines? }",
	"- execute_bash: { type, command, timeoutMs? }",
	"- apply_diff: { type, path, oldText, newText, replaceAll? }",
	"Order actions so each step can rely on prior shell state (cwd/env persist for execute_bash).",
	"Keep batches concise and actionable; stop once enough context or verification is gathered.",
].join("\n");

function buildSubmitBatchTool(maxBatchActions: number): Tool {
	return {
		name: "submit_action_batch",
		description: "Submit the planned sequential action batch for execution.",
		parameters: createSubmitActionBatchToolSchema(maxBatchActions),
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
		throw new Error("executor model did not return submit_action_batch");
	}

	return parseActionBatchPayload(toolCall.arguments, maxBatchActions);
}

/**
 * Plans a batch from an objective using the configured executor model, or the
 * Pi session driver model when no executor override is configured.
 */
export async function analyzeBatchObjective(
	objective: string,
	driverModel: Model<Api>,
	modelRegistry: ModelRegistry,
	config: ResolvedBatchQueueConfig,
	signal?: AbortSignal,
): Promise<ActionBatchPayload> {
	const executorModel: Model<Api> | undefined = config.executorModel
		? modelRegistry.find(config.executorModel.provider, config.executorModel.id)
		: driverModel;

	if (!executorModel) {
		const ref = config.executorModel;
		throw new Error(
			ref
				? `executor model not found: ${ref.provider}/${ref.id}`
				: "executor model not available (missing Pi session driver model)",
		);
	}

	const auth = await modelRegistry.getApiKeyAndHeaders(executorModel);
	if (!auth.ok) {
		throw new Error(auth.error);
	}
	const userMessage: Message = {
		role: "user",
		content: [{ type: "text", text: objective }],
		timestamp: Date.now(),
	};

	const response = await complete(
		executorModel,
		{
			systemPrompt: ANALYZER_SYSTEM_PROMPT,
			messages: [userMessage],
			tools: [buildSubmitBatchTool(config.maxBatchActions)],
		},
		{ apiKey: auth.apiKey, headers: auth.headers, signal, toolChoice: "any" },
	);

	if (response.stopReason === "aborted") {
		throw new Error("batch analysis aborted");
	}
	if (response.stopReason === "error") {
		throw new Error(response.errorMessage ?? "executor model request failed");
	}

	return extractBatchFromResponse(response, config.maxBatchActions);
}

export function createBatchQueueToolParameters(maxBatchActions: number) {
	return Type.Object({
		objective: Type.Optional(
			Type.String({
				description:
					"Use when the next few coding actions are obvious but tedious to enumerate; the executor plans up to N safe sequential actions.",
			}),
		),
		actions: Type.Optional(
			Type.Array(QueueActionSchema, {
				minItems: 1,
				maxItems: maxBatchActions,
				description:
					"Pre-planned action batch from the driver model. Preferred when the exact deterministic reads, searches, checks, or edits are already known; skips executor analysis.",
			}),
		),
		batchId: Type.Optional(
			Type.String({
				description: "Stable label for logging and debugging; not semantically important.",
			}),
		),
	});
}
