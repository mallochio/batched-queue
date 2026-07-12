import type { ResolvedBatchQueueConfig } from "./config.js";
import {
	configuredExecutionModelDescription,
	planningModelDescription,
} from "./planning-model.js";

export function buildBatchQueueDescription(
	config: ResolvedBatchQueueConfig,
	driverModelLine: string,
): string {
	return (
		"Execute up to N sequential coding actions in one low-latency batch with persistent shell state.\n\n" +
		"RGB-style workflow: describe an objective, let the tool plan safe sequential actions, then replan when results change or the queue finishes.\n" +
		"For multi-step repo inspection or verification, default to `objective` instead of separate read, grep, or bash calls.\n" +
		`Maximum ${config.maxBatchActions} actions per batch (configurable).\n\n` +
		"Prefer `objective` for read/check workflows when the goal is clear.\n" +
		"Use explicit `actions` only when exact ordered commands/paths are already known, or when apply_diff is required.\n" +
		"Objective-planned mutations are disabled by default; pass explicit `actions` for apply_diff or enable allowObjectiveMutations in config.\n" +
		"Prefer parallel independent reads/searches instead. Do not use this tool for destructive, long-running, interactive, or approval-sensitive commands.\n\n" +
		"Action types: read_lines, grep_pattern, execute_bash, apply_diff.\n" +
		"Fast-fail: batch halts on first non-zero exit or validation failure. File actions are workspace-scoped unless configured otherwise.\n" +
		`Planner / driver model: ${driverModelLine}\n` +
		`Execution model (objective batches only): ${configuredExecutionModelDescription(config)}`
	);
}
