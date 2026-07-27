import {
	ACTION_TYPES,
	DEFAULT_MAX_BATCH_ACTIONS,
	MIN_BATCH_ACTIONS,
	type ActionType,
} from "./constants.js";
import type { QueueAction, ReadLinesAction } from "./actions.js";
import type { ActionBatchPayload, UnvalidatedActionBatchPayload } from "./payload.js";
import type { ActionExecutionResult } from "./results.js";
import type { ResolvedBatchQueueConfig } from "./config.js";

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

function hasValidBinding(value: Record<string, unknown>): boolean {
	return value.bindTo === undefined || (
		typeof value.bindTo === "string" &&
		/^[A-Za-z_][A-Za-z0-9_]*$/.test(value.bindTo)
	);
}

function isReadLinesAction(value: Record<string, unknown>): boolean {
	return (
		hasOnlyKeys(value, ["type", "path", "startLine", "endLine", "bindTo"]) &&
		value.type === "read_lines" &&
		isNonEmptyString(value.path) &&
		isOptionalInteger(value.startLine, 1) &&
		isOptionalInteger(value.endLine, 1) &&
		hasValidBinding(value)
	);
}

function isGrepPatternAction(value: Record<string, unknown>): boolean {
	return (
		hasOnlyKeys(value, ["type", "pattern", "path", "glob", "caseSensitive", "literal", "contextLines", "bindTo"]) &&
		value.type === "grep_pattern" &&
		isNonEmptyString(value.pattern) &&
		isOptionalNonEmptyString(value.path) &&
		isOptionalNonEmptyString(value.glob) &&
		isOptionalBoolean(value.caseSensitive) &&
		isOptionalBoolean(value.literal) &&
		isOptionalInteger(value.contextLines, 0, 10) &&
		hasValidBinding(value)
	);
}

function isExecuteBashAction(value: Record<string, unknown>): boolean {
	return (
		hasOnlyKeys(value, ["type", "command", "timeoutMs", "bindTo"]) &&
		value.type === "execute_bash" &&
		isNonEmptyString(value.command) &&
		isOptionalInteger(value.timeoutMs, 1) &&
		hasValidBinding(value)
	);
}

function isApplyDiffAction(value: Record<string, unknown>): boolean {
	return (
		hasOnlyKeys(value, ["type", "path", "oldText", "newText", "replaceAll", "bindTo"]) &&
		value.type === "apply_diff" &&
		isNonEmptyString(value.path) &&
		typeof value.oldText === "string" &&
		typeof value.newText === "string" &&
		isOptionalBoolean(value.replaceAll) &&
		hasValidBinding(value)
	);
}

function isPlanReflection(value: unknown): boolean {
	return (
		isRecord(value) &&
		hasOnlyKeys(value, ["confidence", "successCriteria", "risks", "fallback"]) &&
		isInteger(value.confidence, 0, 5) &&
		isNonEmptyString(value.successCriteria) &&
		Array.isArray(value.risks) &&
		value.risks.every(risk => typeof risk === "string") &&
		(value.fallback === undefined || typeof value.fallback === "string")
	);
}

export function isActionType(value: string): value is ActionType {
	return (ACTION_TYPES as readonly string[]).includes(value);
}

export function isQueueAction(value: unknown): value is QueueAction {
	return isRecord(value) && (
		isReadLinesAction(value) ||
		isGrepPatternAction(value) ||
		isExecuteBashAction(value) ||
		isApplyDiffAction(value)
	);
}

export function assertQueueAction(value: unknown): asserts value is QueueAction {
	if (!isQueueAction(value)) throw new Error("Invalid queue action");
}

export function isActionBatchPayload(
	value: unknown,
	maxBatchActions: number = DEFAULT_MAX_BATCH_ACTIONS,
): value is ActionBatchPayload {
	return (
		isRecord(value) &&
		hasOnlyKeys(value, ["actions", "batchId", "rationale", "reflection"]) &&
		Array.isArray(value.actions) &&
		value.actions.length >= MIN_BATCH_ACTIONS &&
		value.actions.length <= maxBatchActions &&
		value.actions.every(isQueueAction) &&
		(value.batchId === undefined || isNonEmptyString(value.batchId)) &&
		(value.rationale === undefined || typeof value.rationale === "string") &&
		(value.reflection === undefined || isPlanReflection(value.reflection))
	);
}

export function parseActionBatchPayload(
	value: unknown,
	maxBatchActions: number = DEFAULT_MAX_BATCH_ACTIONS,
): ActionBatchPayload {
	if (!isActionBatchPayload(value, maxBatchActions)) {
		throw new Error("Invalid action batch payload");
	}

	return value;
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
