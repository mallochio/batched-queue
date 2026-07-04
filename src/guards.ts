import { Value } from "@sinclair/typebox/value";
import {
	ACTION_TYPES,
	DEFAULT_MAX_BATCH_ACTIONS,
	MIN_BATCH_ACTIONS,
	type ActionType,
} from "./constants.js";
import type {
	QueueAction,
	ReadLinesAction,
	GrepPatternAction,
	ExecuteBashAction,
	ApplyDiffAction,
} from "./actions.js";
import type { ActionBatchPayload, UnvalidatedActionBatchPayload } from "./payload.js";
import type { ActionExecutionResult } from "./results.js";
import type { ResolvedBatchQueueConfig } from "./config.js";
import {
	createActionBatchPayloadSchema,
	QueueActionSchema,
	type ActionBatchPayloadSchemaType,
	type QueueActionFromSchema,
} from "./schemas.js";

export function isActionType(value: string): value is ActionType {
	return (ACTION_TYPES as readonly string[]).includes(value);
}

export function isReadLinesAction(action: QueueAction): action is ReadLinesAction {
	return action.type === "read_lines";
}

export function isGrepPatternAction(action: QueueAction): action is GrepPatternAction {
	return action.type === "grep_pattern";
}

export function isExecuteBashAction(action: QueueAction): action is ExecuteBashAction {
	return action.type === "execute_bash";
}

export function isApplyDiffAction(action: QueueAction): action is ApplyDiffAction {
	return action.type === "apply_diff";
}

export function isQueueAction(value: unknown): value is QueueActionFromSchema {
	return Value.Check(QueueActionSchema, value);
}

export function assertQueueAction(value: unknown): asserts value is QueueAction {
	if (!isQueueAction(value)) {
		const errors = [...Value.Errors(QueueActionSchema, value)];
		const detail = errors[0]?.message ?? "invalid queue action";
		throw new Error(`Invalid queue action: ${detail}`);
	}
}

export function isActionBatchPayload(
	value: unknown,
	maxBatchActions: number = DEFAULT_MAX_BATCH_ACTIONS,
): value is ActionBatchPayloadSchemaType {
	return Value.Check(createActionBatchPayloadSchema(maxBatchActions), value);
}

/**
 * Parse and validate an analyzer-produced batch payload.
 */
export function parseActionBatchPayload(
	value: unknown,
	maxBatchActions: number = DEFAULT_MAX_BATCH_ACTIONS,
): ActionBatchPayload {
	if (!isActionBatchPayload(value, maxBatchActions)) {
		const errors = [
			...Value.Errors(createActionBatchPayloadSchema(maxBatchActions), value),
		];
		const detail = errors[0]?.message ?? "invalid batch payload";
		throw new Error(`Invalid action batch payload: ${detail}`);
	}

	return {
		actions: value.actions,
		batchId: value.batchId,
		rationale: value.rationale,
	};
}

export function parseActionBatchPayloadWithConfig(
	value: unknown,
	config: Pick<ResolvedBatchQueueConfig, "maxBatchActions">,
): ActionBatchPayload {
	return parseActionBatchPayload(value, config.maxBatchActions);
}

export function getActionType(action: QueueAction): ActionType {
	return action.type;
}

/** Exhaustive dispatch helper for action discriminators. */
export function matchQueueAction<R>(
	action: QueueAction,
	handlers: { [K in ActionType]: (a: Extract<QueueAction, { type: K }>) => R },
): R {
	switch (action.type) {
		case "read_lines":
			return handlers.read_lines(action);
		case "grep_pattern":
			return handlers.grep_pattern(action);
		case "execute_bash":
			return handlers.execute_bash(action);
		case "apply_diff":
			return handlers.apply_diff(action);
		default: {
			const _exhaustive: never = action;
			throw new Error(`Unhandled action type: ${(_exhaustive as QueueAction).type}`);
		}
	}
}

/** Exhaustive dispatch helper for action execution results. */
export function matchActionExecutionResult<R>(
	result: ActionExecutionResult,
	handlers: {
		[K in ActionType]: (
			r: Extract<ActionExecutionResult, { type: K }>,
		) => R;
	},
): R {
	switch (result.type) {
		case "read_lines":
			return handlers.read_lines(result);
		case "grep_pattern":
			return handlers.grep_pattern(result);
		case "execute_bash":
			return handlers.execute_bash(result);
		case "apply_diff":
			return handlers.apply_diff(result);
		default: {
			const _exhaustive: never = result;
			throw new Error(`Unhandled result type: ${(_exhaustive as ActionExecutionResult).type}`);
		}
	}
}

export function validateBatchActionCount(
	payload: UnvalidatedActionBatchPayload,
	maxBatchActions: number = DEFAULT_MAX_BATCH_ACTIONS,
): string | null {
	const count = payload.actions.length;
	if (count < MIN_BATCH_ACTIONS) {
		return `batch must contain at least ${MIN_BATCH_ACTIONS} action`;
	}
	if (count > maxBatchActions) {
		return `batch exceeds maximum of ${maxBatchActions} actions (got ${count})`;
	}
	return null;
}

export function validateReadLinesRange(action: ReadLinesAction): string | null {
	if (action.startLine !== undefined && action.startLine < 1) {
		return "startLine must be >= 1";
	}
	if (action.endLine !== undefined && action.endLine < 1) {
		return "endLine must be >= 1";
	}
	if (
		action.startLine !== undefined &&
		action.endLine !== undefined &&
		action.endLine < action.startLine
	) {
		return "endLine must be >= startLine";
	}
	return null;
}
