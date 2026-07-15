import type { QueueAction } from "./actions.js";
import type { ActionExecutionResult } from "./results.js";

export type BatchVariableBindings = Record<string, string>;

const VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const VARIABLE_REFERENCE_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const MAX_BOUND_VALUE_CHARS = 8_000;

export class BatchVariableResolutionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "BatchVariableResolutionError";
	}
}

function validateVariableName(name: string): void {
	if (!VARIABLE_NAME_PATTERN.test(name)) {
		throw new BatchVariableResolutionError(
			`invalid batch variable name: ${name}; use ${VARIABLE_NAME_PATTERN.source}`,
		);
	}
}

function truncateBoundValue(value: string): string {
	if (value.length <= MAX_BOUND_VALUE_CHARS) {
		return value;
	}
	return `${value.slice(0, MAX_BOUND_VALUE_CHARS)}\n[batch variable truncated: ${value.length - MAX_BOUND_VALUE_CHARS} chars omitted]`;
}

function expandString(value: string, bindings: BatchVariableBindings): string {
	return value.replace(VARIABLE_REFERENCE_PATTERN, (_full, name: string) => {
		validateVariableName(name);
		const bound = bindings[name];
		if (bound === undefined) {
			throw new BatchVariableResolutionError(`unbound batch variable: ${name}`);
		}
		return bound;
	});
}

function expandOptionalString(value: string | undefined, bindings: BatchVariableBindings): string | undefined {
	return value === undefined ? undefined : expandString(value, bindings);
}

export function resolveActionBindings(action: QueueAction, bindings: BatchVariableBindings): QueueAction {
	switch (action.type) {
		case "read_lines":
			return {
				...action,
				path: expandString(action.path, bindings),
			};
		case "grep_pattern":
			return {
				...action,
				pattern: expandString(action.pattern, bindings),
				path: expandOptionalString(action.path, bindings),
				glob: expandOptionalString(action.glob, bindings),
			};
		case "execute_bash":
			return {
				...action,
				command: expandString(action.command, bindings),
			};
		case "apply_diff":
			return {
				...action,
				path: expandString(action.path, bindings),
				oldText: expandString(action.oldText, bindings),
				newText: expandString(action.newText, bindings),
			};
		default: {
			const exhaustive: never = action;
			return exhaustive;
		}
	}
}

function resultToBindingValue(result: ActionExecutionResult): string {
	switch (result.type) {
		case "read_lines":
			return result.formatted || result.lines.map((line) => `${line.lineNumber}: ${line.text}`).join("\n");
		case "grep_pattern":
			return result.matches.map((match) => `${match.path}:${match.lineNumber}: ${match.text}`).join("\n") || "(no matches)";
		case "execute_bash":
			return result.stdout.text;
		case "apply_diff":
			return `${result.path} (${result.applied ? "applied" : "not applied"})`;
		default: {
			const exhaustive: never = result;
			return exhaustive;
		}
	}
}

export function bindActionResult(action: QueueAction, result: ActionExecutionResult, bindings: BatchVariableBindings): void {
	const bindTo = action.bindTo?.trim();
	if (!bindTo || !result.success) {
		return;
	}
	validateVariableName(bindTo);
	bindings[bindTo] = truncateBoundValue(resultToBindingValue(result));
}
