import { assertObjectiveMutationPolicy, analyzerSystemPrompt } from "../analyzer.js";
import type { ResolvedBatchQueueConfig } from "../config.js";
import { parseActionBatchPayload } from "../guards.js";
import type { ActionBatchPayload } from "../payload.js";
import { createSubmitActionBatchToolSchema } from "../schemas.js";
import type { PluginInput } from "@opencode-ai/plugin";

type OpenCodeClient = PluginInput["client"];

interface StructuredPromptInfo {
	readonly structured_output?: unknown;
	readonly error?: { readonly name?: string; readonly message?: string };
}

function requireExecutorModel(config: ResolvedBatchQueueConfig): {
	readonly provider: string;
	readonly id: string;
} {
	if (!config.executorModel) {
		throw new Error(
			"batch_queue objective mode requires executorModel in config (.opencode/batched-queue.json, opencode.batchQueue in package.json, or BATCH_QUEUE_EXECUTOR)",
		);
	}
	return config.executorModel;
}

function extractStructuredOutput(result: Awaited<ReturnType<OpenCodeClient["session"]["prompt"]>>): unknown {
	const info = result.data?.info as StructuredPromptInfo | undefined;
	if (info?.structured_output !== undefined) {
		return info.structured_output;
	}

	for (const part of result.data?.parts ?? []) {
		if (part.type === "text" && part.text.trim()) {
			try {
				return JSON.parse(part.text);
			} catch {
				continue;
			}
		}
	}

	return undefined;
}

export async function analyzeOpenCodeBatchObjective(
	client: OpenCodeClient,
	sessionID: string,
	objective: string,
	config: ResolvedBatchQueueConfig,
): Promise<ActionBatchPayload> {
	const executorModel = requireExecutorModel(config);
	const schema = createSubmitActionBatchToolSchema(config.maxBatchActions, {
		allowMutatingActions: config.allowObjectiveMutations,
	});

	const result = await client.session.prompt({
		path: { id: sessionID },
		body: {
			model: {
				providerID: executorModel.provider,
				modelID: executorModel.id,
			},
			parts: [
				{ type: "text", text: `${analyzerSystemPrompt(config)}\n\nObjective:\n${objective}` },
			],
			format: {
				type: "json_schema",
				schema: schema as Record<string, unknown>,
			},
		} as Parameters<OpenCodeClient["session"]["prompt"]>[0]["body"],
	});

	const info = result.data?.info as StructuredPromptInfo | undefined;
	const error = info?.error;
	if (error?.name === "StructuredOutputError") {
		throw new Error(error.message ?? "executor model failed to produce structured batch plan");
	}

	const structured = extractStructuredOutput(result);
	if (!structured) {
		throw new Error("executor model did not return structured batch plan");
	}

	const payload = parseActionBatchPayload(structured, config.maxBatchActions);
	assertObjectiveMutationPolicy(payload, config);
	return payload;
}
