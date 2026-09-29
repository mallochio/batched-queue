import { MAX_BATCH_ACTIONS, MIN_BATCH_ACTIONS, type ActionType } from "./constants.js";
import type { ActionBatchPayload, QueueAction, ReadLinesAction } from "./actions.js";
import type { ActionExecutionResult } from "./results.js";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
	return Object.keys(value).every(key => allowed.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function isOptionalNonEmptyString(value: unknown): boolean {
	return value === undefined || isNonEmptyString(value);
}

function isOptionalBoolean(value: unknown): boolean {
	return value === undefined || typeof value === "boolean";
}

function isInteger(value: unknown, minimum: number, maximum?: number): boolean {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= minimum &&
		(maximum === undefined || value <= maximum)
	);
}

function isOptionalInteger(value: unknown, minimum: number, maximum?: number): boolean {
	return value === undefined || isInteger(value, minimum, maximum);
}

function isReadLinesAction(value: Record<string, unknown>): boolean {
	return (
		hasOnlyKeys(value, ["type", "path", "startLine", "endLine"]) &&
		value.type === "read_lines" &&
		isNonEmptyString(value.path) &&
		isOptionalInteger(value.startLine, 1) &&
		isOptionalInteger(value.endLine, 1)
	);
}

function isGrepPatternAction(value: Record<string, unknown>): boolean {
	return (
		hasOnlyKeys(value, ["type", "pattern", "path", "glob", "caseSensitive", "literal", "contextLines"]) &&
		value.type === "grep_pattern" &&
		isNonEmptyString(value.pattern) &&
		isOptionalNonEmptyString(value.path) &&
		isOptionalNonEmptyString(value.glob) &&
		isOptionalBoolean(value.caseSensitive) &&
		isOptionalBoolean(value.literal) &&
		isOptionalInteger(value.contextLines, 0, 10)
	);
}

function isExecuteBashAction(value: Record<string, unknown>): boolean {
	return (
		hasOnlyKeys(value, ["type", "command", "timeoutMs"]) &&
		value.type === "execute_bash" &&
		isNonEmptyString(value.command) &&
		isOptionalInteger(value.timeoutMs, 1)
	);
}

function isApplyDiffAction(value: Record<string, unknown>): boolean {
	return (
		hasOnlyKeys(value, ["type", "path", "oldText", "newText", "replaceAll"]) &&
		value.type === "apply_diff" &&
		isNonEmptyString(value.path) &&
		typeof value.oldText === "string" &&
		typeof value.newText === "string" &&
		isOptionalBoolean(value.replaceAll)
	);
}

export function isQueueAction(value: unknown): value is QueueAction {
	return isRecord(value) && (
		isReadLinesAction(value) ||
		isGrepPatternAction(value) ||
		isExecuteBashAction(value) ||
		isApplyDiffAction(value)
	);
}

export function parseActionBatchPayload(value: unknown): ActionBatchPayload {
	if (
		!isRecord(value) ||
		!hasOnlyKeys(value, ["actions", "batchId"]) ||
		!Array.isArray(value.actions) ||
		value.actions.length < MIN_BATCH_ACTIONS ||
		value.actions.length > MAX_BATCH_ACTIONS ||
		!value.actions.every(isQueueAction) ||
		!isOptionalNonEmptyString(value.batchId)
	) {
		throw new Error(`Invalid batch: pass 1 to ${MAX_BATCH_ACTIONS} valid actions`);
	}
	return value as unknown as ActionBatchPayload;
}

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
