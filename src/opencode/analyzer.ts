import { assertObjectiveMutationPolicy, analyzerSystemPrompt } from "../analyzer.js";
import type { ResolvedBatchQueueConfig } from "../config.js";
import { parseActionBatchPayload } from "../guards.js";
import type { ActionBatchPayload } from "../payload.js";
import { createSubmitActionBatchToolSchema } from "../schemas.js";
import type { PluginInput } from "@opencode-ai/plugin";

type OpenCodeClient = PluginInput["client"];
type PromptResult = Awaited<ReturnType<OpenCodeClient["session"]["prompt"]>>;

interface StructuredPromptInfo {
	readonly structured?: unknown;
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

function extractStructuredOutput(result: PromptResult): unknown {
	const info = result.data?.info as StructuredPromptInfo | undefined;
	if (info?.structured !== undefined) {
		return info.structured;
	}
	if (info?.structured_output !== undefined) {
		return info.structured_output;
	}

	for (const part of result.data?.parts ?? []) {
		if (part.type === "text" && part.text.trim()) {
			const trimmed = part.text.trim();
			const jsonStart = trimmed.indexOf("{");
			const jsonEnd = trimmed.lastIndexOf("}");
			if (jsonStart === -1 || jsonEnd <= jsonStart) {
				continue;
			}
			try {
				return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
			} catch {
				continue;
			}
		}
	}

	return undefined;
}

async function createPlanningSession(client: OpenCodeClient): Promise<string> {
	const created = await client.session.create({
		body: { title: "batch-queue-plan" },
	});
	const sessionID = created.data?.id;
	if (!sessionID) {
		throw new Error("failed to create executor planning session");
	}
	return sessionID;
}

async function disposePlanningSession(
	client: OpenCodeClient,
	sessionID: string,
): Promise<void> {
	try {
		await client.session.delete({ path: { id: sessionID } });
	} catch {
		// Best-effort cleanup for ephemeral planning sessions.
	}
}

function buildObjectivePrompt(objective: string, config: ResolvedBatchQueueConfig): string {
	return [
		analyzerSystemPrompt(config),
		"",
		`Objective:\n${objective}`,
		"",
		'Return ONLY a JSON object shaped like {"actions":[...],"rationale":"..."}.',
	].join("\n");
}

async function promptExecutor(
	client: OpenCodeClient,
	sessionID: string,
	executorModel: { readonly provider: string; readonly id: string },
	config: ResolvedBatchQueueConfig,
	objective: string,
): Promise<PromptResult> {
	const schema = JSON.parse(
		JSON.stringify(
			createSubmitActionBatchToolSchema(config.maxBatchActions, {
				allowMutatingActions: config.allowObjectiveMutations,
			}),
		),
	) as Record<string, unknown>;

	const model = {
		providerID: executorModel.provider,
		modelID: executorModel.id,
	};
	const parts = [{ type: "text" as const, text: buildObjectivePrompt(objective, config) }];

	try {
		return await client.session.prompt({
			path: { id: sessionID },
			body: {
				model,
				parts,
				format: {
					type: "json_schema",
					schema,
				},
			} as never,
		});
	} catch {
		return client.session.prompt({
			path: { id: sessionID },
			body: {
				model,
				parts,
			},
		});
	}
}

export async function analyzeOpenCodeBatchObjective(
	client: OpenCodeClient,
	_sessionID: string,
	objective: string,
	config: ResolvedBatchQueueConfig,
): Promise<ActionBatchPayload> {
	const executorModel = requireExecutorModel(config);
	const planningSessionID = await createPlanningSession(client);

	try {
		const result = await promptExecutor(
			client,
			planningSessionID,
			executorModel,
			config,
			objective,
		);

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
	} finally {
		await disposePlanningSession(client, planningSessionID);
	}
}
