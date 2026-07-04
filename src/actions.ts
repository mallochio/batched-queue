import type { Static } from "@sinclair/typebox";
import type { ActionType } from "./constants.js";
import {
	ApplyDiffActionSchema,
	ExecuteBashActionSchema,
	GrepPatternActionSchema,
	QueueActionSchema,
	ReadLinesActionSchema,
} from "./schemas.js";

/** 1-based inclusive line range for partial file reads. */
export interface LineRange {
	readonly startLine: number;
	readonly endLine: number;
}

export type ReadLinesAction = Static<typeof ReadLinesActionSchema>;
export type GrepPatternAction = Static<typeof GrepPatternActionSchema>;
export type ExecuteBashAction = Static<typeof ExecuteBashActionSchema>;
export type ApplyDiffAction = Static<typeof ApplyDiffActionSchema>;

/** Discriminated union of all queue action variants (derived from QueueActionSchema). */
export type QueueAction = Static<typeof QueueActionSchema>;

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
