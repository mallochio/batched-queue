import type { ResolvedBatchQueueConfig } from "./config.js";

export function buildBatchQueueDescription(
	config: ResolvedBatchQueueConfig,
	executorLine: string,
): string {
	return (
		"Execute up to N sequential coding actions in one low-latency batch with persistent shell state.\n\n" +
		"For coding work, default to this tool for small sequential inspect/search/check loops instead of making multiple individual read, grep, or bash calls.\n" +
		`Maximum ${config.maxBatchActions} actions per batch (configurable).\n\n` +
		"Prefer this tool when you need 2-5 low-risk sequential repo actions, such as inspecting files, searching symbols/text, running small shell checks, applying a targeted diff, or verifying a local change.\n" +
		"Use `actions` when you already know the exact deterministic steps. Use `objective` when a cheaper executor model should plan read/check-only steps.\n" +
		"Objective-planned mutations are disabled by default; pass explicit `actions` for apply_diff or enable allowObjectiveMutations in config.\n" +
		"Prefer parallel independent reads/searches instead. Do not use this tool for destructive, long-running, interactive, or approval-sensitive commands.\n\n" +
		"Action types: read_lines, grep_pattern, execute_bash, apply_diff.\n" +
		"Fast-fail: batch halts on first non-zero exit or validation failure. File actions are workspace-scoped unless configured otherwise.\n" +
		`Executor model: ${executorLine}`
	);
}
