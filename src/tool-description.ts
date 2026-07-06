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
		"RGB-style workflow: plan a batch of explicit steps, execute with zero per-action LLM calls, then replan when results change or the queue finishes.\n" +
		"For coding work, default to explicit `actions` from the session driver / planner instead of multiple individual read, grep, or bash calls.\n" +
		`Maximum ${config.maxBatchActions} actions per batch (configurable).\n\n` +
		"Prefer explicit `actions` when you already know the exact deterministic steps, especially for apply_diff.\n" +
		"Use `objective` only when the goal is clear but enumerating steps is tedious; the session driver plans by default, or a configured cheap execution model when set.\n" +
		"Objective-planned mutations are disabled by default; pass explicit `actions` for apply_diff or enable allowObjectiveMutations in config.\n" +
		"Prefer parallel independent reads/searches instead. Do not use this tool for destructive, long-running, interactive, or approval-sensitive commands.\n\n" +
		"Action types: read_lines, grep_pattern, execute_bash, apply_diff.\n" +
		"Fast-fail: batch halts on first non-zero exit or validation failure. File actions are workspace-scoped unless configured otherwise.\n" +
		`Planner / driver model: ${driverModelLine}\n` +
		`Execution model (objective batches only): ${configuredExecutionModelDescription(config)}`
	);
}
