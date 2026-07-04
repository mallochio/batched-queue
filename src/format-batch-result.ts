import { matchActionExecutionResult } from "./guards";
import type { BatchExecutionResult } from "./results";

function formatActionResultLines(actionResult: BatchExecutionResult["results"][number]): string[] {
	const lines: string[] = [
		`[${actionResult.index}] ${actionResult.type} exit=${actionResult.exitCode} ${actionResult.success ? "ok" : "FAIL"}`,
	];
	if (actionResult.error) {
		lines.push(`  error: ${actionResult.error}`);
	}

	const detailLines = matchActionExecutionResult(actionResult, {
		read_lines: (result) => {
			if (!result.formatted) return [];
			return result.formatted.split("\n").slice(0, 20).map((line) => `  ${line}`);
		},
		grep_pattern: (result) =>
			result.matches
				.slice(0, 10)
				.map((match) => `  ${match.path}:${match.lineNumber}: ${match.text}`),
		execute_bash: (result) => {
			const output: string[] = [];
			if (result.stdout.text) {
				output.push(
					`  stdout:\n${result.stdout.text.split("\n").map((line) => `    ${line}`).join("\n")}`,
				);
			}
			if (result.stderr.text) {
				output.push(
					`  stderr:\n${result.stderr.text.split("\n").map((line) => `    ${line}`).join("\n")}`,
				);
			}
			return output;
		},
		apply_diff: (result) => [
			`  applied=${result.applied} strategy=${result.matchStrategy ?? "n/a"} bytes ${result.bytesBefore}->${result.bytesAfter}`,
		],
	});
	lines.push(...detailLines);
	return lines;
}

export function formatBatchResult(result: BatchExecutionResult): string {
	const lines: string[] = [
		result.haltedPrematurely
			? `batch halted at action ${result.haltedAtIndex ?? "?"} (${result.haltReason})`
			: "batch completed successfully",
		`completed ${result.completedCount}/${result.totalRequested} actions in ${result.durationMs}ms`,
		`shell cwd: ${result.shellState.cwd}`,
	];

	for (const actionResult of result.results) {
		lines.push("");
		lines.push(...formatActionResultLines(actionResult));
	}

	return lines.join("\n");
}
