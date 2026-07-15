import type { ResolvedBatchQueueConfig } from "./config.js";
import { configuredExecutionModelDescription } from "./planning-model.js";

export function buildBatchQueueDescription(
	config: ResolvedBatchQueueConfig,
	driverModelLine: string,
): string {
	return (
		`Run up to ${config.maxBatchActions} short, dependent coding actions in one low-latency sequential batch.\n\n` +
		"Use this tool when a repository workflow is too dependent for parallel calls but too small for a workflow engine: discover → inspect → verify. Action execution makes no additional model calls, preserves shell cwd/environment state, and returns evidence for replanning.\n\n" +
		"For one obvious read, grep, or bash command, call the native tool directly. For independent actions, prefer parallel tool calls.\n" +
		"For multi-step repository inspection, verification, or change preparation, prefer `objective`; the tool can ground a safe plan in the workspace before executing it.\n\n" +
		"Use explicit `actions` when the exact sequence is known, when applying `apply_diff`, or when continuing after a failed batch. Objective-planned mutations are disabled by default.\n\n" +
		"Action types: read_lines, grep_pattern, execute_bash, apply_diff. Optional `bindTo` names an action result; later string fields can reference it as `${name}`. Interpolation is raw text, not shell escaping.\n" +
		"Fast-fail: the batch halts on the first non-zero exit, timeout, path violation, or validation failure. File actions are workspace-scoped unless configured otherwise.\n" +
		`Planner / driver model: ${driverModelLine}\n` +
		`Execution model (objective batches only): ${configuredExecutionModelDescription(config)}`
	);
}
