import type { ActionBatchActions } from "./actions.js";

/**
 * Input envelope produced by the agent analyzer for a single batched turn.
 * Action count ceiling is enforced at runtime via ResolvedBatchQueueConfig.
 */
export interface ActionBatchPayload {
	/** Ordered list of actions executed sequentially in one turn. */
	readonly actions: ActionBatchActions;
	/** Optional correlation id for logging and result matching. */
	readonly batchId?: string;
	/** Optional short rationale surfaced in debug tooling. */
	readonly rationale?: string;
}

/** Loose input shape before runtime validation narrows the actions array. */
export interface UnvalidatedActionBatchPayload {
	readonly actions: readonly unknown[];
	readonly batchId?: string;
	readonly rationale?: string;
}
