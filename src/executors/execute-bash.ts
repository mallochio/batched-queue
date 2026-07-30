import type { ExecuteBashAction } from "../actions";
import type { ExecuteBashActionResult } from "../results";
import { BASH_TIMEOUT_EXIT_CODE, type OutputLimits } from "../constants";
import { captureStderr, captureStdout } from "../capture";
import type { PersistentShell } from "../persistent-shell";
import type { ShellSessionState } from "../state";
import {
	evaluatePermissionAsync,
	loadPermissions,
	type PermissionRule,
} from "../lib/permissions";

export interface ExecuteBashExecutionContext {
	readonly shell: PersistentShell;
	readonly shellState: ShellSessionState;
	readonly limits: OutputLimits;
	readonly defaultTimeoutMs: number;
	readonly permissionRules?: PermissionRule[];
}

export async function executeBashCommand(
	action: ExecuteBashAction,
	index: number,
	ctx: ExecuteBashExecutionContext,
): Promise<ExecuteBashActionResult> {
	const started = Date.now();

	const rules = ctx.permissionRules ?? loadPermissions();
	const verdict = await evaluatePermissionAsync(
		"Bash",
		{ cmd: action.command },
		rules,
	);
	if (verdict.action === "reject") {
		const message = verdict.message
			? `command rejected: ${verdict.message}`
			: `command rejected by permission rule. command: ${action.command}`;

		return {
			index,
			type: "execute_bash",
			success: false,
			exitCode: 1,
			durationMs: Date.now() - started,
			command: action.command,
			stdout: { text: "" },
			stderr: { text: message },
			error: message,
			haltReason: "permission_denied",
		};
	}

	try {
		const result = await ctx.shell.execute(
			action.command,
			action.timeoutMs ?? ctx.defaultTimeoutMs,
		);

		ctx.shellState.cwd = result.cwd;
		ctx.shellState.lastExitCode = result.exitCode;
		ctx.shellState.alive = ctx.shell.isAlive;

		return {
			index,
			type: "execute_bash",
			success: result.exitCode === 0,
			exitCode: result.exitCode,
			durationMs: Date.now() - started,
			command: action.command,
			stdout: captureStdout(result.stdout, ctx.limits),
			stderr: captureStderr(result.stderr, ctx.limits),
			error: result.exitCode === 0 ? undefined : `command exited with code ${result.exitCode}`,
			haltReason: result.exitCode === 0 ? undefined : "non_zero_exit",
		};
	} catch (error) {
		ctx.shellState.alive = ctx.shell.isAlive;
		const message = error instanceof Error ? error.message : String(error);
		const isTimeout = message.includes("timed out");

		return {
			index,
			type: "execute_bash",
			success: false,
			exitCode: isTimeout ? BASH_TIMEOUT_EXIT_CODE : 1,
			durationMs: Date.now() - started,
			command: action.command,
			stdout: { text: "" },
			stderr: { text: message },
			error: message,
			haltReason: isTimeout ? "timeout" : undefined,
		};
	}
}
