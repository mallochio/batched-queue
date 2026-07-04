import type { QueueAction } from "../actions";
import type { ActionExecutionResult } from "../results";
import type { OutputLimits } from "../constants";
import { DEFAULT_COMMAND_TIMEOUT_MS } from "../constants";
import type { PersistentShell } from "../persistent-shell";
import type { ShellSessionState } from "../state";
import type { PathSecurityConfig } from "../lib/path-security";
import { executeReadLines } from "./read-lines";
import { executeGrepPattern } from "./grep-pattern";
import { executeBashCommand } from "./execute-bash";
import { executeApplyDiff } from "./apply-diff";

export interface ExecutorContext {
	/** Workspace root used for path resolution and security boundary checks. */
	readonly workspaceRoot: string;
	readonly pathSecurity?: PathSecurityConfig;
	readonly shell: PersistentShell;
	readonly shellState: ShellSessionState;
	readonly limits: OutputLimits;
	readonly defaultTimeoutMs: number;
}

export async function executeQueueAction(
	action: QueueAction,
	index: number,
	ctx: ExecutorContext,
): Promise<ActionExecutionResult> {
	switch (action.type) {
		case "read_lines":
			return executeReadLines(action, index, {
				workspaceRoot: ctx.workspaceRoot,
				pathSecurity: ctx.pathSecurity,
				limits: ctx.limits,
			});
		case "grep_pattern":
			return executeGrepPattern(action, index, {
				workspaceRoot: ctx.workspaceRoot,
				pathSecurity: ctx.pathSecurity,
				limits: ctx.limits,
				defaultTimeoutMs: ctx.defaultTimeoutMs,
			});
		case "execute_bash":
			return executeBashCommand(action, index, {
				shell: ctx.shell,
				shellState: ctx.shellState,
				limits: ctx.limits,
				defaultTimeoutMs: ctx.defaultTimeoutMs,
			});
		case "apply_diff":
			return executeApplyDiff(action, index, {
				workspaceRoot: ctx.workspaceRoot,
				pathSecurity: ctx.pathSecurity,
			});
		default: {
			const _exhaustive: never = action;
			throw new Error(`Unhandled action type: ${(_exhaustive as QueueAction).type}`);
		}
	}
}

export { DEFAULT_COMMAND_TIMEOUT_MS };
