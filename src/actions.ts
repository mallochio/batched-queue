import type { ActionType } from "./constants.js";

/** 1-based inclusive line range for partial file reads. */
export interface LineRange {
	readonly startLine: number;
	readonly endLine: number;
}

export interface ReadLinesAction {
	readonly type: "read_lines";
	/** File path relative to the session workspace or absolute. */
	readonly path: string;
	/** When omitted, reads from line 1. Must be >= 1. */
	readonly startLine?: number;
	/** When omitted, reads through EOF. Must be >= startLine. */
	readonly endLine?: number;
}

export interface GrepPatternAction {
	readonly type: "grep_pattern";
	readonly pattern: string;
	/** File or directory to search. Defaults to workspace root. */
	readonly path?: string;
	/** Optional glob filter forwarded to ripgrep (e.g. `*.ts`). */
	readonly glob?: string;
	readonly caseSensitive?: boolean;
	/** When true, treat pattern as a literal string instead of regex. */
	readonly literal?: boolean;
	/** Context lines before/after each match. */
	readonly contextLines?: number;
}

export interface ExecuteBashAction {
	readonly type: "execute_bash";
	/** Shell command executed inside the persistent session shell. */
	readonly command: string;
	/** Optional per-action timeout override in milliseconds. */
	readonly timeoutMs?: number;
}

export interface ApplyDiffAction {
	readonly type: "apply_diff";
	readonly path: string;
	/** Exact or structural block to replace (validated in Milestone 3). */
	readonly oldText: string;
	readonly newText: string;
	/** Replace all occurrences instead of requiring a unique match. */
	readonly replaceAll?: boolean;
}

/** Discriminated union of all queue action variants. */
export type QueueAction =
	| ReadLinesAction
	| GrepPatternAction
	| ExecuteBashAction
	| ApplyDiffAction;

/** Maps each action discriminator to its concrete payload shape. */
export interface QueueActionMap {
	readonly read_lines: ReadLinesAction;
	readonly grep_pattern: GrepPatternAction;
	readonly execute_bash: ExecuteBashAction;
	readonly apply_diff: ApplyDiffAction;
}

/** Extract the payload type for a specific action discriminator. */
export type QueueActionOf<T extends ActionType> = QueueActionMap[T];

/** Runtime-validated action list; length ceiling is enforced via config (default 5). */
export type ActionBatchActions = readonly QueueAction[];

/** @deprecated Use ActionBatchActions; length is config-driven at runtime. */
export type ActionBatchTuple = ActionBatchActions;
