// Shared types for the batched-queue Pi headless benchmark harness.

export type ConditionId = "native" | "batch-explicit" | "batch-objective";

export type Outcome = "pass" | "fail" | "timeout" | "provider_error" | "invalid";

export interface UsageTotals {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	reasoningTokens: number;
	totalTokens: number;
	costUsd: number;
}

export interface BatchActionStats {
	/** Number of batch_queue tool calls. */
	batchCalls: number;
	/** Sum of completed actions across all batch_queue calls. */
	completedActions: number;
	/** Sum of requested actions across all batch_queue calls. */
	requestedActions: number;
	/** Number of batch_queue calls that halted (fast-fail). */
	haltedBatches: number;
}

export interface ParsedEvents {
	modelTurns: number;
	toolCalls: number;
	toolBreakdown: Record<string, number>;
	usage: UsageTotals;
	resultBytes: number;
	batch: BatchActionStats;
	reachedAgentEnd: boolean;
	willRetry: boolean;
	/** Concatenated text of all final-transcript assistant messages. */
	finalAssistantText: string;
	/** Raw output text from execute_bash and batch_queue tool results. */
	bashOutputs: string[];
	haltReason: string | null;
	parseErrors: number;
}

export interface FixtureExpectations {
	scenario: string;
	family: string;
	proof: Record<string, unknown>;
}

export interface OracleContext {
	fixtureDir: string;
	expected: FixtureExpectations;
	parsed: ParsedEvents;
	timedOut: boolean;
	readFixtureFile(path: string): string | null;
	reverify(command: string, timeoutMs?: number): Promise<{
		exitCode: number;
		stdout: string;
		stderr: string;
	}>;
}

export interface OracleResult {
	passed: boolean;
	checks: Record<string, boolean>;
	note?: string;
}

export interface ScenarioSpec {
	/** Stable scenario id, e.g. "H1". */
	id: string;
	/** Short human label. */
	label: string;
	/**
	 * Task instruction shared across every condition. The condition-specific
	 * tool instruction is appended by the runner so prompts stay identical
	 * except for the required tool selection.
	 */
	task: string;
	/**
	 * Deterministic completion predicate. Receives the final assistant text
	 * (concatenated) and returns whether the task was correctly completed.
	 * Kept for compatibility; fixture-owned oracles take precedence.
	 */
	predicate: (finalText: string) => boolean;
	/**
	 * Fixture-owned oracle that inspects proof artifacts and re-runs
	 * verification commands. Takes precedence over predicate when supplied.
	 */
	oracle?: (ctx: OracleContext) => Promise<OracleResult> | OracleResult;
	/** Whether this scenario expects the batch to fast-fail (H4-style). */
	expectsHalt?: boolean;
}

export interface ConditionSpec {
	id: ConditionId;
	label: string;
	/** Extra Pi CLI args unique to this condition. */
	piArgs: string[];
	/** Tool-selection instruction appended to every scenario task. */
	toolInstruction: string;
	/** Extra environment variables set only for this condition. */
	env?: Record<string, string>;
}

export interface RunSummary {
	scenario: string;
	condition: ConditionId;
	run: number;
	model: string;
	/** Process exit code of the Pi invocation. */
	exitCode: number;
	/** True if the process was killed by the timeout. */
	timedOut: boolean;
	/** Wall-clock milliseconds for the Pi invocation. */
	elapsedMs: number;
	/** turn_start events (model turns). */
	modelTurns: number;
	/** tool_execution_start events. */
	toolCalls: number;
	/** Tool names to call counts. */
	toolBreakdown: Record<string, number>;
	/**
	 * Effective repository actions executed. For batch conditions this is the
	 * count of completed sub-actions; for native it equals toolCalls.
	 */
	actionsCompleted: number;
	/** actionsCompleted / max(toolCalls, 1). */
	actionCompression: number;
	usage: UsageTotals;
	/** Bytes of tool result payload returned to the model. */
	resultBytes: number;
	/** Whether the completion predicate or oracle passed. */
	verificationPassed: boolean;
	batch: BatchActionStats;
	/** Did the run terminate at agent_end without a retry? */
	completed: boolean;
	/** One of the outcome taxonomy values. */
	outcome: Outcome;
	/** Oracle result when an oracle was run. */
	oracle?: OracleResult;
	/** Reason a batch halted, if any. */
	haltReason: string | null;
}

export interface Manifest {
	date: string;
	driverModel: string;
	executorModel: string | null;
	provider: string;
	thinking: string;
	repetitions: number;
	scenarios: string[];
	conditions: ConditionId[];
	piVersion: string;
	commit: string;
}
