import * as os from "node:os";
import * as path from "node:path";
import type { CapturedStream, TruncationInfo } from "./truncation";
import type { OutputLimits } from "./constants";
import {
	DEFAULT_PATH_SECURITY,
	findWorkspaceRoot,
	validateResolvedPath,
	type PathSecurityConfig,
} from "./lib/path-security";

function expandPath(filePath: string): string {
	const stripped = filePath.startsWith("@") ? filePath.slice(1) : filePath;
	if (stripped === "~") return os.homedir();
	if (stripped.startsWith("~/")) return os.homedir() + stripped.slice(1);
	return stripped;
}

function resolveToAbsolute(filePath: string, cwd: string): string {
	const expanded = expandPath(filePath);
	return path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
}

export interface ResolvedPathValidation {
	readonly allowed: boolean;
	readonly resolvedPath: string;
	readonly reason?: string;
}

export function resolveAndValidatePath(
	filePath: string,
	workspaceRoot: string,
	config: PathSecurityConfig = DEFAULT_PATH_SECURITY,
	gitWorkspaceRoot?: string,
): ResolvedPathValidation {
	const resolvedPath = resolveToAbsolute(filePath, workspaceRoot);
	const gitRoot = gitWorkspaceRoot ?? findWorkspaceRoot(workspaceRoot);
	const validation = validateResolvedPath(resolvedPath, config, gitRoot);

	return {
		allowed: validation.allowed,
		resolvedPath: validation.resolvedPath,
		reason: validation.reason,
	};
}

export function truncateLines(
	lines: string[],
	maxLines: number,
): { lines: string[]; truncation?: TruncationInfo } {
	if (lines.length <= maxLines) {
		return { lines };
	}

	const half = Math.floor(maxLines / 2);
	const headUnits = half;
	const tailUnits = maxLines - half;
	const omittedUnits = lines.length - headUnits - tailUnits;

	return {
		lines: [...lines.slice(0, headUnits), ...lines.slice(-tailUnits)],
		truncation: {
			truncated: true,
			unit: "lines",
			totalUnits: lines.length,
			headUnits,
			tailUnits,
			omittedUnits,
		},
	};
}

export function captureStreamText(
	text: string,
	maxLines: number,
	maxChars: number,
): CapturedStream {
	const rawLines = text.length === 0 ? [] : text.split("\n");
	const lineLimited = truncateLines(rawLines, maxLines);
	let resultText = lineLimited.lines.join("\n");
	let truncation = lineLimited.truncation;

	if (resultText.length > maxChars) {
		const half = Math.floor(maxChars / 2);
		const head = resultText.slice(0, half);
		const tail = resultText.slice(-half);
		resultText = `${head}\n\n... [${resultText.length - maxChars} characters truncated] ...\n\n${tail}`;
		truncation = {
			truncated: true,
			unit: "chars",
			totalUnits: text.length,
			headUnits: half,
			tailUnits: half,
			omittedUnits: text.length - maxChars,
		};
	}

	return truncation ? { text: resultText, truncation } : { text: resultText };
}

export function captureStdout(
	text: string,
	limits: OutputLimits,
): CapturedStream {
	return captureStreamText(
		text,
		limits.maxStdoutLines,
		limits.maxStdoutChars,
	);
}

export function captureStderr(
	text: string,
	limits: OutputLimits,
): CapturedStream {
	return captureStreamText(
		text,
		limits.maxStderrLines,
		limits.maxStderrChars,
	);
}

export function truncateLineText(line: string, maxChars: number): string {
	if (line.length <= maxChars) return line;
	return `${line.slice(0, maxChars)}...`;
}
