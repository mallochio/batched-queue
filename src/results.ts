import type { ActionType } from "./constants.js";
import type { QueueAction } from "./actions.js";
import type { CapturedStream, TruncationInfo } from "./truncation.js";
import type { ShellSessionStateSnapshot } from "./state.js";

/** Why a batch halted before completing all queued actions. */
export type BatchHaltReason =
	| "non_zero_exit"
	| "validation_failed"
	| "action_error"
	| "permission_denied"
	| "timeout"
	| "shell_unavailable";

/** Default halt reason when an executor omits an explicit one on failure. */
export const DEFAULT_FAILURE_HALT_REASON: BatchHaltReason = "non_zero_exit";

export interface ActionResultBase<TType extends ActionType> {
	readonly index: number;
	readonly type: TType;
	readonly success: boolean;
	/** Process exit code when applicable; 0 indicates success. */
	readonly exitCode: number;
	readonly durationMs: number;
	readonly error?: string;
	/** Structured halt reason when this action caused batch fast-fail. */
	readonly haltReason?: BatchHaltReason;
}

export interface ReadLineEntry {
	readonly lineNumber: number;
	readonly text: string;
}

export interface ReadLinesActionResult extends ActionResultBase<"read_lines"> {
	readonly path: string;
	readonly lines: readonly ReadLineEntry[];
	readonly formatted: string;
	readonly totalLinesInFile: number;
	readonly requestedRange?: {
		readonly startLine: number;
		readonly endLine: number;
	};
	readonly truncation?: TruncationInfo;
}

export interface GrepMatchEntry {
	readonly path: string;
	readonly lineNumber: number;
	readonly text: string;
	readonly isContext: boolean;
}

export interface GrepPatternActionResult extends ActionResultBase<"grep_pattern"> {
	readonly pattern: string;
	readonly matches: readonly GrepMatchEntry[];
	readonly matchCount: number;
	readonly truncated: boolean;
	readonly truncation?: TruncationInfo;
}

export interface ExecuteBashActionResult extends ActionResultBase<"execute_bash"> {
	readonly command: string;
	readonly stdout: CapturedStream;
	readonly stderr: CapturedStream;
}

export type DiffMatchStrategy =
	| "exact"
	| "normalized"
	| "sliding_window";

export interface ApplyDiffActionResult extends ActionResultBase<"apply_diff"> {
	readonly path: string;
	readonly applied: boolean;
	readonly matchStrategy?: DiffMatchStrategy;
	readonly bytesBefore: number;
	readonly bytesAfter: number;
	readonly validationErrors?: readonly string[];
}

/** Discriminated union of per-action execution results. */
export type ActionExecutionResult =
	| ReadLinesActionResult
	| GrepPatternActionResult
	| ExecuteBashActionResult
	| ApplyDiffActionResult;

/** Maps action discriminators to their result shapes. */
export interface ActionExecutionResultMap {
	readonly read_lines: ReadLinesActionResult;
	readonly grep_pattern: GrepPatternActionResult;
	readonly execute_bash: ExecuteBashActionResult;
	readonly apply_diff: ApplyDiffActionResult;
}

export type ActionExecutionResultOf<T extends ActionType> =
	ActionExecutionResultMap[T];

/**
 * Comprehensive structured output returned after a batch run completes
 * or halts prematurely.
 */
export interface BatchExecutionResult {
	readonly batchId?: string;
	/** True when fast-fail halted the batch before all actions ran. */
	readonly haltedPrematurely: boolean;
	readonly haltReason?: BatchHaltReason;
	/** Zero-based index of the action that caused the halt, if any. */
	readonly haltedAtIndex?: number;
	readonly completedCount: number;
	readonly totalRequested: number;
	readonly results: readonly ActionExecutionResult[];
	readonly shellState: ShellSessionStateSnapshot;
	readonly startedAtMs: number;
	readonly completedAtMs: number;
	readonly durationMs: number;
	/** Populated when the batch aborts due to an unexpected runner failure. */
	readonly error?: string;
}

/** Pairing of the requested action with its execution result. */
export interface ActionResultPair<TAction extends QueueAction = QueueAction> {
	readonly action: TAction;
	readonly result: ActionExecutionResultOf<TAction["type"]>;
}
