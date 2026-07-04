import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
	DEFAULT_COMMAND_TIMEOUT_MS,
	SHELL_META_PREFIX,
	SHELL_SENTINEL_PREFIX,
	SHELL_STDERR_END_MARKER,
	SHELL_STDOUT_END_MARKER,
} from "./constants";

export interface ShellCommandResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
	readonly cwd: string;
}

interface PendingCommand {
	readonly resolve: (result: ShellCommandResult) => void;
	readonly reject: (error: Error) => void;
	readonly timeoutMs: number;
	readonly timer: ReturnType<typeof setTimeout>;
}

export interface PersistentShellOptions {
	readonly initialCwd: string;
	readonly env?: Record<string, string>;
	readonly defaultTimeoutMs?: number;
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildInitScript(initialCwd: string): string {
	const q = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

	return [
		"set +m",
		"export PS1=''",
		"unset PROMPT_COMMAND",
		`cd ${q(initialCwd)} || exit 1`,
		"__bq_exec() {",
		"  local __bq_out __bq_err __bq_ec",
		"  __bq_out=\"$(mktemp)\"",
		"  __bq_err=\"$(mktemp)\"",
		"  if [[ \"$1\" == exit* ]]; then",
		"    ( eval \"$1\" ) >\"$__bq_out\" 2>\"$__bq_err\"",
		"    __bq_ec=$?",
		"  else",
		"    eval \"$1\" >\"$__bq_out\" 2>\"$__bq_err\"",
		"    __bq_ec=$?",
		"  fi",
		"  cat \"$__bq_out\"",
		`  printf '%s\\n' ${q(SHELL_STDOUT_END_MARKER)}`,
		"  cat \"$__bq_err\"",
		`  printf '%s\\n' ${q(SHELL_STDERR_END_MARKER)}`,
		`  printf '%s\\n' "${SHELL_META_PREFIX}\${__bq_ec}:\$(pwd -P)"`,
		"  rm -f \"$__bq_out\" \"$__bq_err\"",
		"  return $__bq_ec",
		"}",
		`printf '%s\\n' ${q(`${SHELL_SENTINEL_PREFIX}:READY`)}`,
	].join("\n");
}

function parseCompletedOutput(buffer: string): ShellCommandResult | null {
	const metaPattern = new RegExp(
		`${escapeRegex(SHELL_META_PREFIX)}(\\d+):(.+)\\r?\\n?$`,
	);
	const metaMatch = buffer.match(metaPattern);
	if (!metaMatch || metaMatch.index === undefined) {
		return null;
	}

	const stdoutEndIdx = buffer.lastIndexOf(SHELL_STDOUT_END_MARKER);
	const stderrEndIdx = buffer.lastIndexOf(SHELL_STDERR_END_MARKER);
	if (stdoutEndIdx === -1 || stderrEndIdx === -1) {
		return null;
	}

	const stdout = buffer.slice(0, stdoutEndIdx).replace(/^\n/, "");
	const stderr = buffer
		.slice(stdoutEndIdx + SHELL_STDOUT_END_MARKER.length, stderrEndIdx)
		.replace(/^\n/, "")
		.replace(/\n$/, "");

	return {
		exitCode: Number.parseInt(metaMatch[1], 10),
		cwd: metaMatch[2],
		stdout,
		stderr,
	};
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Persistent interactive bash session used by the batch queue runner.
 * Commands run in the same shell so `cd` and exported env vars persist.
 */
export class PersistentShell {
	private readonly process: ChildProcessWithoutNullStreams;
	private readonly defaultTimeoutMs: number;
	private buffer = "";
	private pending: PendingCommand | null = null;
	private readyResolve: (() => void) | null = null;
	private readyReject: ((error: Error) => void) | null = null;
	private readonly ready: Promise<void>;
	private closed = false;

	constructor(options: PersistentShellOptions) {
		this.defaultTimeoutMs =
			options.defaultTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;

		this.process = spawn("bash", ["--norc", "--noprofile"], {
			cwd: options.initialCwd,
			env: { ...process.env, ...options.env },
			stdio: ["pipe", "pipe", "pipe"],
		});

		this.ready = new Promise<void>((resolve, reject) => {
			this.readyResolve = resolve;
			this.readyReject = reject;
		});

		this.process.stdout.setEncoding("utf8");
		this.process.stderr.setEncoding("utf8");

		this.process.stdout.on("data", (chunk: string) => {
			this.buffer += chunk;
			this.tryCompletePending();
		});

		this.process.stderr.on("data", (chunk: string) => {
			// Bash startup noise only; command stderr is captured via __bq_exec.
			if (!this.pending) {
				this.buffer += chunk;
				this.tryCompletePending();
			}
		});

		this.process.on("error", (error) => {
			this.closed = true;
			this.rejectPending(error);
			this.readyReject?.(error);
		});

		this.process.on("close", (code) => {
			this.closed = true;
			const error = new Error(`persistent shell exited with code ${code ?? "unknown"}`);
			if (this.readyReject) {
				this.readyReject(error);
				this.readyResolve = null;
				this.readyReject = null;
			}
			this.rejectPending(error);
		});

		this.process.stdin.write(`${buildInitScript(options.initialCwd)}\n`);
	}

	async waitUntilReady(): Promise<void> {
		await this.ready;
	}

	get isAlive(): boolean {
		return !this.closed && this.process.exitCode === null;
	}

	/** Marks the shell unhealthy, rejects in-flight work, and kills the process. */
	markUnhealthy(reason: string): void {
		if (this.closed) {
			return;
		}

		this.closed = true;
		const error = new Error(reason);

		if (this.readyReject) {
			this.readyReject(error);
			this.readyResolve = null;
			this.readyReject = null;
		}

		this.rejectPending(error);

		try {
			this.process.kill("SIGKILL");
		} catch {
			// ignore
		}
	}

	async execute(
		command: string,
		timeoutMs: number = this.defaultTimeoutMs,
	): Promise<ShellCommandResult> {
		await this.waitUntilReady();

		if (this.closed || !this.process.stdin.writable) {
			throw new Error("persistent shell is not available");
		}
		if (this.pending) {
			throw new Error("persistent shell already has a command in flight");
		}

		return new Promise<ShellCommandResult>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.markUnhealthy(`command timed out after ${timeoutMs}ms`);
			}, timeoutMs);

			this.pending = { resolve, reject, timeoutMs, timer };

			const payload = `__bq_exec ${shellQuote(command)}\n`;
			this.process.stdin.write(payload, (error) => {
				if (error) {
					clearTimeout(timer);
					this.pending = null;
					reject(error);
				}
			});
		});
	}

	async dispose(): Promise<void> {
		if (this.closed) return;

		try {
			this.process.stdin.end("exit\n");
		} catch {
			// ignore
		}

		await new Promise<void>((resolve) => {
			const timer = setTimeout(() => {
				try {
					this.process.kill("SIGKILL");
				} catch {
					// ignore
				}
				resolve();
			}, 1_000);

			this.process.once("close", () => {
				clearTimeout(timer);
				resolve();
			});
		});
	}

	private tryCompletePending(): void {
		if (this.buffer.includes(`${SHELL_SENTINEL_PREFIX}:READY`) && this.readyResolve) {
			this.buffer = "";
			this.readyResolve();
			this.readyResolve = null;
			this.readyReject = null;
			return;
		}

		if (!this.pending) return;

		const parsed = parseCompletedOutput(this.buffer);
		if (!parsed) return;

		clearTimeout(this.pending.timer);
		this.buffer = "";
		const pending = this.pending;
		this.pending = null;
		pending.resolve(parsed);
	}

	private rejectPending(error: Error): void {
		if (this.pending) {
			clearTimeout(this.pending.timer);
			const pending = this.pending;
			this.pending = null;
			pending.reject(error);
		}
	}
}

export function createPersistentShell(
	options: PersistentShellOptions,
): PersistentShell {
	return new PersistentShell(options);
}
