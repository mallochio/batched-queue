import * as fs from "node:fs";
import type { ReadLinesAction } from "../actions";
import type { ReadLinesActionResult } from "../results";
import type { OutputLimits } from "../constants";
import type { TruncationInfo } from "../truncation";
import {
	resolveAndValidatePath,
	truncateLineText,
	truncateLines,
} from "../capture";
import { validateReadLinesRange } from "../guards";
import type { PathSecurityConfig } from "../lib/path-security";

export interface ReadLinesExecutionContext {
	readonly workspaceRoot: string;
	readonly limits: OutputLimits;
	readonly pathSecurity?: PathSecurityConfig;
}

export function executeReadLines(
	action: ReadLinesAction,
	index: number,
	ctx: ReadLinesExecutionContext,
): ReadLinesActionResult {
	const started = Date.now();
	const rangeError = validateReadLinesRange(action);
	if (rangeError) {
		return {
			index,
			type: "read_lines",
			success: false,
			exitCode: 1,
			durationMs: Date.now() - started,
			error: rangeError,
			haltReason: "action_error",
			path: action.path,
			lines: [],
			formatted: "",
			totalLinesInFile: 0,
		};
	}

	const pathResult = resolveAndValidatePath(
		action.path,
		ctx.workspaceRoot,
		ctx.pathSecurity,
	);
	if (!pathResult.allowed) {
		return {
			index,
			type: "read_lines",
			success: false,
			exitCode: 1,
			durationMs: Date.now() - started,
			error: pathResult.reason ?? "path not allowed",
			haltReason: "action_error",
			path: action.path,
			lines: [],
			formatted: "",
			totalLinesInFile: 0,
		};
	}

	const absolutePath = pathResult.resolvedPath;

	if (!fs.existsSync(absolutePath)) {
		return {
			index,
			type: "read_lines",
			success: false,
			exitCode: 1,
			durationMs: Date.now() - started,
			error: `file not found: ${action.path}`,
			haltReason: "action_error",
			path: action.path,
			lines: [],
			formatted: "",
			totalLinesInFile: 0,
		};
	}

	const stat = fs.statSync(absolutePath);
	if (!stat.isFile()) {
		return {
			index,
			type: "read_lines",
			success: false,
			exitCode: 1,
			durationMs: Date.now() - started,
			error: `not a file: ${action.path}`,
			haltReason: "action_error",
			path: action.path,
			lines: [],
			formatted: "",
			totalLinesInFile: 0,
		};
	}

	const content = fs.readFileSync(absolutePath, "utf8");
	const allLines = content.split("\n");
	const totalLinesInFile = content.length === 0 ? 0 : allLines.length;

	const startLine = action.startLine ?? 1;
	const endLine = action.endLine ?? totalLinesInFile;
	const sliceStart = Math.max(0, startLine - 1);
	const sliceEnd = Math.min(totalLinesInFile, endLine);

	const selected = allLines.slice(sliceStart, sliceEnd).map((text, offset) => ({
		lineNumber: sliceStart + offset + 1,
		text: truncateLineText(text, ctx.limits.maxLineChars),
	}));

	const lineLimited = truncateLines(
		selected.map((entry) => entry.text),
		ctx.limits.maxReadLines,
	);

	let lines = selected;
	const truncation: TruncationInfo | undefined = lineLimited.truncation;

	if (lineLimited.truncation) {
		const { headUnits, tailUnits } = lineLimited.truncation;
		lines = [
			...selected.slice(0, headUnits),
			...selected.slice(-tailUnits),
		];
	}

	const formatted = lines.map((line) => `${line.lineNumber}: ${line.text}`).join("\n");

	return {
		index,
		type: "read_lines",
		success: true,
		exitCode: 0,
		durationMs: Date.now() - started,
		path: action.path,
		lines,
		formatted,
		totalLinesInFile,
		requestedRange: { startLine, endLine },
		truncation,
	};
}
