import type { Static } from "typebox";
import {
	ApplyDiffActionSchema,
	ExecuteBashActionSchema,
	GrepPatternActionSchema,
	QueueActionSchema,
	ReadLinesActionSchema,
} from "./schemas.js";

export type ReadLinesAction = Static<typeof ReadLinesActionSchema>;
export type GrepPatternAction = Static<typeof GrepPatternActionSchema>;
export type ExecuteBashAction = Static<typeof ExecuteBashActionSchema>;
export type ApplyDiffAction = Static<typeof ApplyDiffActionSchema>;

/** Discriminated union of all queue action variants (derived from QueueActionSchema). */
export type QueueAction = Static<typeof QueueActionSchema>;

/** One validated batch of actions. */
export interface ActionBatchPayload {
	readonly actions: readonly QueueAction[];
	readonly batchId?: string;
}
