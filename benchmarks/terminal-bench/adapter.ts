import type { AdapterCondition, TerminalBenchAdapter, TerminalBenchTask } from "./types.ts";

const BASE_TOOLS = [
	"execute_bash",
	"read_lines",
	"grep_pattern",
	"apply_diff",
] as const;

/**
 * Create a Terminal-Bench Pi adapter for a condition.
 *
 * The native and batch adapters must be identical except for the `batch_queue`
 * tool, which is only registered in the `batch` condition.
 */
export function createTerminalBenchAdapter(condition: AdapterCondition): TerminalBenchAdapter {
	if (condition === "batch") {
		return {
			condition,
			tools: [...BASE_TOOLS, "batch_queue"],
			supportsBatchQueue: true,
		};
	}
	return {
		condition,
		tools: [...BASE_TOOLS],
		supportsBatchQueue: false,
	};
}

/** Verify that the two adapters differ only by `batch_queue`. */
export function adaptersAreParityChecked(
	native: TerminalBenchAdapter,
	batch: TerminalBenchAdapter,
): boolean {
	const nativeSet = new Set(native.tools);
	const batchSet = new Set(batch.tools);
	for (const tool of native.tools) {
		if (!batchSet.has(tool)) return false;
	}
	for (const tool of batch.tools) {
		if (tool !== "batch_queue" && !nativeSet.has(tool)) return false;
	}
	return batch.tools.length === native.tools.length + 1 && batch.supportsBatchQueue;
}

/** Load tasks from a Terminal-Bench dataset JSONL or JSON array file. */
export function loadTerminalBenchTasks(path: string): TerminalBenchTask[] {
	// TODO: real loader for `dataset.jsonl` once the dataset is downloaded.
	// The scaffold returns an empty list so no paid task is run by accident.
	void path;
	return [];
}
