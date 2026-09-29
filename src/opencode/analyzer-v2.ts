import type { ModelRef, ResolvedBatchQueueConfig } from "../config.js";
import { assertObjectiveMutationPolicy, analyzerSystemPrompt } from "../analyzer.js";
import { parseActionBatchPayload } from "../guards.js";
import type { ActionBatchPayload } from "../payload.js";
import { resolvePlanningModelRef } from "../planning-model.js";
import type { PlannerUsage } from "../planner-usage.js";
import { emptyPlannerUsage, finalizePlannerUsage } from "../planner-usage.js";
import type { OpenCodeObjectiveResult } from "./analyzer.js";

export interface OpenCodeV2GenerateText {
	(input: {
		readonly prompt: string;
		readonly model?: {
			readonly id: string;
			readonly providerID: string;
			readonly variant?: string;
		} | null;
	}): Promise<{ readonly text: string }>;
}

export interface OpenCodeV2SessionGet {
	(input: { readonly sessionID: string }): Promise<{
		readonly model?: {
			readonly id: string;
			readonly providerID: string;
			readonly variant?: string;
		};
	}>;
}

function buildObjectivePrompt(objective: string, config: ResolvedBatchQueueConfig): string {
	return [
		analyzerSystemPrompt(config),
		"",
		`Objective:\n${objective}`,
		"",
		"Do not answer with markdown or prose.",
		'Return ONLY a JSON object shaped like {"actions":[{"type":"read_lines","path":"src/example.ts"}],"rationale":"inspect example","reflection":{"confidence":4,"successCriteria":"example inspected","risks":[],"fallback":"use explicit actions"}}. Use confidence as an integer from 0 to 5.',
	].join("\n");
}

function extractJsonObject(text: string): unknown {
	const trimmed = text.trim();
	const jsonStart = trimmed.indexOf("{");
	const jsonEnd = trimmed.lastIndexOf("}");
	if (jsonStart === -1 || jsonEnd <= jsonStart) {
		return undefined;
	}
	try {
		return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
	} catch {
		return undefined;
	}
}

export function openCodeSessionDirectory(session: {
	readonly location?: { readonly directory?: string } | null;
}): string {
	const directory = session.location?.directory?.trim();
	if (!directory) {
		throw new Error("batch_queue requires the OpenCode session directory");
	}
	return directory;
}

export async function resolveOpenCodeV2SessionModelRef(
	sessionGet: OpenCodeV2SessionGet,
	sessionID: string,
): Promise<ModelRef> {
	const session = await sessionGet({ sessionID });
	if (session.model?.providerID && session.model.id) {
		return {
			provider: session.model.providerID,
			id: session.model.id,
		};
	}
	throw new Error("batch_queue objective mode requires a session model on the parent session");
}

/**
 * Objective→actions planning for OpenCode V2 via `ctx.generate.text`.
 * Avoids ephemeral planning sessions (V2 plugin SessionDomain has no remove).
 */
export async function analyzeOpenCodeV2BatchObjective(
	deps: {
		readonly sessionGet: OpenCodeV2SessionGet;
		readonly generateText: OpenCodeV2GenerateText;
	},
	parentSessionID: string,
	objective: string,
	config: ResolvedBatchQueueConfig,
): Promise<OpenCodeObjectiveResult> {
	if (config.executorBaseUrl || config.executorApiKey) {
		throw new Error(
			"OpenCode v2 objective mode cannot use BATCH_QUEUE_EXECUTOR_BASE_URL or BATCH_QUEUE_EXECUTOR_API_KEY. Unset them, or pass explicit actions. Prime Agent and OpenCode 1.x still honor those variables.",
		);
	}

	const driverModel = await resolveOpenCodeV2SessionModelRef(deps.sessionGet, parentSessionID);
	const planningModel = resolvePlanningModelRef(driverModel, config);
	const usageAccumulator = emptyPlannerUsage(planningModel.provider, planningModel.id);

	const result = await deps.generateText({
		prompt: buildObjectivePrompt(objective, config),
		model: {
			id: planningModel.id,
			providerID: planningModel.provider,
		},
	});

	const structured = extractJsonObject(result.text);
	if (!structured) {
		throw new Error("planning model did not return structured batch plan");
	}

	const payload: ActionBatchPayload = parseActionBatchPayload(structured, config.maxBatchActions);
	assertObjectiveMutationPolicy(payload, config);
	const plannerUsage: PlannerUsage | undefined = finalizePlannerUsage(usageAccumulator);
	return { payload, plannerUsage };
}
