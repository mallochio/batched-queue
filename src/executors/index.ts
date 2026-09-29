import type { QueueAction } from "../actions";
import type { ActionExecutionResult } from "../results";
import type { OutputLimits } from "../constants";
import { DEFAULT_COMMAND_TIMEOUT_MS } from "../constants";
import type { PersistentShell } from "../persistent-shell";
import type { ShellSessionState } from "../state";
import type { PathSecurityConfig } from "../lib/path-security";
import { matchQueueAction } from "../guards";
import { executeReadLines } from "./read-lines";
import { executeGrepPattern } from "./grep-pattern";
import { executeBashCommand } from "./execute-bash";
import { executeApplyDiff } from "./apply-diff";

export interface ExecutorContext {
	/** Session cwd used for relative path resolution. */
	readonly workspaceRoot: string;
	/** Git workspace root cached once per runner (avoids repeated directory walks). */
	readonly gitWorkspaceRoot: string;
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
	return matchQueueAction<Promise<ActionExecutionResult>>(action, {
		read_lines: async (readAction) =>
			executeReadLines(readAction, index, {
				workspaceRoot: ctx.workspaceRoot,
				gitWorkspaceRoot: ctx.gitWorkspaceRoot,
				pathSecurity: ctx.pathSecurity,
				limits: ctx.limits,
			}),
		grep_pattern: async (grepAction) =>
			executeGrepPattern(grepAction, index, {
				workspaceRoot: ctx.workspaceRoot,
				gitWorkspaceRoot: ctx.gitWorkspaceRoot,
				pathSecurity: ctx.pathSecurity,
				limits: ctx.limits,
				defaultTimeoutMs: ctx.defaultTimeoutMs,
			}),
		execute_bash: async (bashAction) =>
			executeBashCommand(bashAction, index, {
				shell: ctx.shell,
				shellState: ctx.shellState,
				limits: ctx.limits,
				defaultTimeoutMs: ctx.defaultTimeoutMs,
			}),
		apply_diff: async (diffAction) =>
			executeApplyDiff(diffAction, index, {
				workspaceRoot: ctx.workspaceRoot,
				gitWorkspaceRoot: ctx.gitWorkspaceRoot,
				pathSecurity: ctx.pathSecurity,
			}),
	});
}

export { DEFAULT_COMMAND_TIMEOUT_MS };
