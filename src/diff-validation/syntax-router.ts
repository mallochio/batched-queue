import { spawnSync } from "node:child_process";
import * as path from "node:path";
import ts from "typescript";

export type SyntaxLanguage =
	| "typescript"
	| "javascript"
	| "json"
	| "python"
	| "unsupported";

export function routeSyntaxLanguage(filePath: string): SyntaxLanguage {
	const ext = path.extname(filePath).toLowerCase();
	switch (ext) {
		case ".ts":
		case ".tsx":
			return "typescript";
		case ".js":
		case ".jsx":
		case ".mjs":
		case ".cjs":
			return "javascript";
		case ".json":
			return "json";
		case ".py":
			return "python";
		default:
			return "unsupported";
	}
}

function validateTypeScriptSyntax(content: string, filePath: string): string[] {
	const sourceFile = ts.createSourceFile(
		filePath,
		content,
		ts.ScriptTarget.Latest,
		true,
		scriptKindForPath(filePath),
	);

	const parseDiagnostics =
		(sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] })
			.parseDiagnostics ?? [];

	return parseDiagnostics.map((diagnostic) =>
		ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
	);
}

function scriptKindForPath(filePath: string): ts.ScriptKind {
	const ext = path.extname(filePath).toLowerCase();
	switch (ext) {
		case ".tsx":
			return ts.ScriptKind.TSX;
		case ".ts":
			return ts.ScriptKind.TS;
		case ".jsx":
			return ts.ScriptKind.JSX;
		case ".js":
		case ".mjs":
		case ".cjs":
			return ts.ScriptKind.JS;
		default:
			return ts.ScriptKind.JS;
	}
}

function validateJsonSyntax(content: string): string[] {
	try {
		JSON.parse(content);
		return [];
	} catch (error) {
		return [error instanceof Error ? error.message : String(error)];
	}
}

function validatePythonSyntax(content: string): string[] {
	const result = spawnSync(
		"python3",
		["-c", "import ast, sys; ast.parse(sys.stdin.read())"],
		{ input: content, encoding: "utf8" },
	);

	if (result.error) {
		return [`python3 unavailable: ${result.error.message}`];
	}
	if (result.status === 0) {
		return [];
	}
	return [(result.stderr || result.stdout || "python syntax error").trim()];
}

/**
 * Tier 3 — extension-routed syntactic sanity check on post-patch content.
 * Unsupported extensions bypass AST validation and rely on structural matching.
 */
export function validateSyntax(
	filePath: string,
	content: string,
): string[] {
	const language = routeSyntaxLanguage(filePath);

	switch (language) {
		case "typescript":
		case "javascript":
			return validateTypeScriptSyntax(content, filePath);
		case "json":
			return validateJsonSyntax(content);
		case "python":
			return validatePythonSyntax(content);
		case "unsupported":
			return [];
		default: {
			const _exhaustive: never = language;
			return _exhaustive;
		}
	}
}
