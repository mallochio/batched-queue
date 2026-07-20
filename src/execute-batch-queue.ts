import type { QueueAction } from "./actions.js";
import type { ResolvedBatchQueueConfig } from "./config.js";
import { parseActionBatchPayloadWithConfig } from "./guards.js";
import type { ActionBatchPayload, PlanReflection } from "./payload.js";
import type { BatchExecutionResult } from "./results.js";
import { formatBatchResult } from "./format-batch-result.js";
import { BatchQueueRunner } from "./queue-runner.js";
import type { PlannerUsage } from "./planner-usage.js";

export interface BatchQueueToolParams {
	readonly objective?: string;
	readonly actions?: readonly QueueAction[];
	readonly batchId?: string;
}

export interface ObjectiveResolutionResult {
	readonly payload: ActionBatchPayload;
	readonly plannerUsage?: PlannerUsage;
}

export interface BatchQueueExecuteDeps {
	readonly resolveObjective?: (
		objective: string,
		signal?: AbortSignal,
	) => Promise<ObjectiveResolutionResult>;
	readonly getSessionId: () => string;
	readonly getCwd: () => string;
}

export interface BatchQueueExecuteResult {
	readonly text: string;
	readonly isError: boolean;
	readonly rationale?: string;
	readonly reflection?: PlanReflection;
	readonly result?: BatchExecutionResult;
	readonly plannerUsage?: PlannerUsage;
	readonly error?: string;
}

export function createRunnerMap(): Map<string, BatchQueueRunner> {
	return new Map();
}

export async function disposeAllRunners(runners: Map<string, BatchQueueRunner>): Promise<void> {
	for (const sessionId of [...runners.keys()]) {
		const runner = runners.get(sessionId);
		if (runner) {
			await runner.dispose();
		}
		runners.delete(sessionId);
	}
}

export function getRunner(
	runners: Map<string, BatchQueueRunner>,
	sessionId: string,
	cwd: string,
	config: ResolvedBatchQueueConfig,
): BatchQueueRunner {
	let runner = runners.get(sessionId);
	if (!runner) {
		runner = new BatchQueueRunner(sessionId, cwd, {
			pathSecurity: config.pathSecurity,
		});
		runners.set(sessionId, runner);
	} else {
		runner.syncWorkspaceRoot(cwd);
	}
	return runner;
}

export async function executeBatchQueue(options: {
	readonly config: ResolvedBatchQueueConfig;
	readonly params: BatchQueueToolParams;
	readonly deps: BatchQueueExecuteDeps;
	readonly runners: Map<string, BatchQueueRunner>;
	readonly signal?: AbortSignal;
}): Promise<BatchQueueExecuteResult> {
	const { config, params, deps, runners, signal } = options;
	let payload: ActionBatchPayload;
	let plannerUsage: PlannerUsage | undefined;

	try {
		if (params.objective?.trim() && params.actions && params.actions.length > 0) {
			return {
				text: "batch_queue accepts exactly one of `objective` or `actions`, not both",
				isError: true,
				error: "objective and actions are mutually exclusive",
			};
		}
		if (params.actions && params.actions.length > 0) {
			payload = parseActionBatchPayloadWithConfig(
				{ actions: params.actions, batchId: params.batchId },
				config,
			);
		} else if (params.objective?.trim()) {
			if (!deps.resolveObjective) {
				return {
					text: "batch_queue objective mode requires a session driver model or executionModel in config",
					isError: true,
					error: "missing objective resolver",
				};
			}
			const resolved = await deps.resolveObjective(params.objective.trim(), signal);
			payload = resolved.payload;
			plannerUsage = resolved.plannerUsage;
			if (params.batchId) {
				payload = { ...payload, batchId: params.batchId };
			}
		} else {
			return {
				text: "batch_queue requires either `objective` (executor plans batch) or `actions` (driver supplies batch)",
				isError: true,
				error: "missing objective or actions",
			};
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			text: `batch_queue planning failed: ${message}`,
			isError: true,
			error: message,
		};
	}

	const runner = getRunner(runners, deps.getSessionId(), deps.getCwd(), config);
	const result = await runner.executeBatch(payload);
	const usedObjective = Boolean(params.objective?.trim()) && !(params.actions && params.actions.length > 0);
	const text = formatBatchResult(result, {
		rationale: payload.rationale,
		reflection: payload.reflection,
		usedObjective,
	});

	return {
		text,
		isError: result.haltedPrematurely,
		rationale: payload.rationale,
		reflection: payload.reflection,
		result,
		plannerUsage,
	};
}
