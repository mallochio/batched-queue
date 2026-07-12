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
		"RGB-style workflow: for 2+ dependent repo steps, describe an objective, let the tool plan safe sequential actions, then replan when results change or the queue finishes.\n" +
		"For one obvious read, grep, or bash command, do not use batch_queue; call the native tool directly.\n" +
		"For multi-step repo inspection, verification, or change prep, default to `objective` instead of separate read, grep, or bash calls.\n" +
		`Maximum ${config.maxBatchActions} actions per batch (configurable).\n\n` +
		"Prefer `objective` for multi-step read/check workflows when the goal is clear; it should usually plan more than one action.\n" +
		"Use explicit `actions` only for 2+ exact ordered actions, apply_diff/mutations, or continuing after a failed batch. Do not wrap a single obvious command in actions.\n" +
		"Objective-planned mutations are disabled by default; pass explicit `actions` for apply_diff or enable allowObjectiveMutations in config.\n" +
		"Each batched action should be a short, non-interactive command; run long-running, interactive, or approval-sensitive commands through the normal tools instead.\n\n" +
		"Action types: read_lines, grep_pattern, execute_bash, apply_diff.\n" +
		"Fast-fail: batch halts on first non-zero exit or validation failure. File actions are workspace-scoped unless configured otherwise.\n" +
		`Planner / driver model: ${driverModelLine}\n` +
		`Execution model (objective batches only): ${configuredExecutionModelDescription(config)}`
	);
}
