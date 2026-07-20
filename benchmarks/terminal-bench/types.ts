/**
 * Minimal Terminal-Bench Core v0.1.1 task and adapter types.
 *
 * This is an adapter scaffold, not the dataset itself. It defines the shape
 * expected from a Terminal-Bench dataset file and the parity contract between
 * the native and explicit-batch Pi adapters.
 */

export interface TerminalBenchTask {
	/** Unique task id from the Terminal-Bench dataset. */
	readonly id: string;
	/** Human-readable task name. */
	readonly name: string;
	/** Optional category, e.g. "test" or "refactor". */
	readonly category?: string;
	/** Repository URL or local path used for the task. */
	readonly repository?: string;
	/** Prompt given to the agent. */
	readonly prompt: string;
	/** Optional hidden oracle substrings for the harness to check after the run. */
	readonly expected?: readonly string[];
	/** Optional per-task timeout override. */
	readonly timeoutMs?: number;
	/** Optional container image reference. */
	readonly container?: string;
}

export type AdapterCondition = "native" | "batch";

/** Tool surface parity contract for the two conditions. */
export interface TerminalBenchAdapter {
	readonly condition: AdapterCondition;
	/** Tool names exposed to the agent. */
	readonly tools: readonly string[];
	/** Whether `batch_queue` is registered. */
	readonly supportsBatchQueue: boolean;
}

export interface TerminalBenchManifest {
	readonly terminalBenchVersion: string;
	readonly datasetVersion: string;
	readonly taskCount: number;
	readonly taskIds: readonly string[];
	readonly split: "held-out" | "pilot" | "all";
	readonly adapterCommit: string;
	readonly piVersion: string;
	readonly model: string;
	readonly provider: string;
	readonly timeoutMs: number;
	readonly concurrency: number;
	readonly budgetUsdPerSession: number;
}
