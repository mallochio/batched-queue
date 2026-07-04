import { spawn } from "node:child_process";
import * as path from "node:path";
import type { GrepPatternAction } from "../actions";
import type { GrepPatternActionResult, GrepMatchEntry } from "../results";
import type { OutputLimits } from "../constants";
import { BASH_TIMEOUT_EXIT_CODE } from "../constants";
import { resolveAndValidatePath, truncateLineText } from "../capture";
import type { PathSecurityConfig } from "../lib/path-security";

export interface GrepPatternExecutionContext {
	readonly workspaceRoot: string;
	readonly limits: OutputLimits;
	readonly pathSecurity?: PathSecurityConfig;
	readonly defaultTimeoutMs: number;
}

export async function executeGrepPattern(
	action: GrepPatternAction,
	index: number,
	ctx: GrepPatternExecutionContext,
): Promise<GrepPatternActionResult> {
	const started = Date.now();
	const pathResult = resolveAndValidatePath(
		action.path ?? ".",
		ctx.workspaceRoot,
		ctx.pathSecurity,
	);
	if (!pathResult.allowed) {
		return {
			index,
			type: "grep_pattern",
			success: false,
			exitCode: 1,
			durationMs: Date.now() - started,
			error: pathResult.reason ?? "path not allowed",
			haltReason: "action_error",
			pattern: action.pattern,
			matches: [],
			matchCount: 0,
			truncated: false,
		};
	}

	const searchPath = pathResult.resolvedPath;

	const args = [
		"--json",
		"--line-number",
		"--no-heading",
		`--context=${action.contextLines ?? 0}`,
	];

	if (action.glob) {
		args.push("--glob", action.glob);
	}
	if (action.literal) {
		args.push("--fixed-strings");
	}
	if (action.caseSensitive === false) {
		args.push("--ignore-case");
	}

	args.push(action.pattern, searchPath);

	const { events, exitCode, errorMessage, timedOut } = await runRipgrep(
		args,
		ctx.defaultTimeoutMs,
	);

	if (timedOut) {
		return {
			index,
			type: "grep_pattern",
			success: false,
			exitCode: BASH_TIMEOUT_EXIT_CODE,
			durationMs: Date.now() - started,
			error: errorMessage,
			haltReason: "timeout",
			pattern: action.pattern,
			matches: [],
			matchCount: 0,
			truncated: false,
		};
	}

	if (errorMessage) {
		return {
			index,
			type: "grep_pattern",
			success: false,
			exitCode: exitCode || 2,
			durationMs: Date.now() - started,
			error: errorMessage,
			haltReason: "non_zero_exit",
			pattern: action.pattern,
			matches: [],
			matchCount: 0,
			truncated: false,
		};
	}

	const matches: GrepMatchEntry[] = [];
	for (const event of events) {
		if (matches.length >= ctx.limits.maxGrepMatches) break;

		const rel = path.relative(ctx.workspaceRoot, event.filePath).replace(/\\/g, "/");
		matches.push({
			path: rel.startsWith("..") ? event.filePath : rel,
			lineNumber: event.lineNumber,
			text: truncateLineText(event.lineText, ctx.limits.maxLineChars),
			isContext: event.kind === "context",
		});
	}

	const matchCount = events.filter((event) => event.kind === "match").length;
	const truncated = matchCount > ctx.limits.maxGrepMatches;

	return {
		index,
		type: "grep_pattern",
		success: true,
		exitCode: 0,
		durationMs: Date.now() - started,
		pattern: action.pattern,
		matches,
		matchCount,
		truncated,
		truncation: truncated
			? {
					truncated: true,
					unit: "lines",
					totalUnits: matchCount,
					headUnits: ctx.limits.maxGrepMatches,
					tailUnits: 0,
					omittedUnits: matchCount - ctx.limits.maxGrepMatches,
				}
			: undefined,
	};
}

interface RgEvent {
	kind: "match" | "context";
	filePath: string;
	lineNumber: number;
	lineText: string;
}

async function runRipgrep(
	args: string[],
	timeoutMs: number,
): Promise<{
	events: RgEvent[];
	exitCode: number;
	errorMessage?: string;
	timedOut?: boolean;
}> {
	return new Promise((resolve) => {
		const child = spawn("rg", args, { stdio: ["ignore", "pipe", "pipe"] });
		let stderr = "";
		const events: RgEvent[] = [];
		let timedOut = false;

		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGTERM");
		}, timeoutMs);

		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});

		child.stdout.setEncoding("utf8");
		let pending = "";
		child.stdout.on("data", (chunk: string) => {
			pending += chunk;
			const lines = pending.split("\n");
			pending = lines.pop() ?? "";

			for (const line of lines) {
				if (!line.trim()) continue;
				try {
					const event = JSON.parse(line) as {
						type?: string;
						data?: {
							path?: { text?: string };
							line_number?: number;
							lines?: { text?: string };
						};
					};
					if (event.type !== "match" && event.type !== "context") continue;
					const filePath = event.data?.path?.text;
					const lineNumber = event.data?.line_number;
					const lineText = (event.data?.lines?.text ?? "").replace(/\r?\n$/, "");
					if (!filePath || typeof lineNumber !== "number") continue;
					events.push({
						kind: event.type,
						filePath,
						lineNumber,
						lineText,
					});
				} catch {
					// ignore malformed json lines
				}
			}
		});

		child.on("error", (error) => {
			clearTimeout(timer);
			resolve({ events, exitCode: 127, errorMessage: error.message });
		});

		child.on("close", (code) => {
			clearTimeout(timer);
			if (timedOut) {
				resolve({
					events,
					exitCode: BASH_TIMEOUT_EXIT_CODE,
					errorMessage: `ripgrep timed out after ${timeoutMs}ms`,
					timedOut: true,
				});
				return;
			}

			const exitCode = code ?? 2;
			if (exitCode !== 0 && exitCode !== 1) {
				resolve({
					events,
					exitCode,
					errorMessage: stderr.trim() || `ripgrep exited with code ${exitCode}`,
				});
				return;
			}
			resolve({ events, exitCode });
		});
	});
}
