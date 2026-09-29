import { matchActionExecutionResult } from "./guards";
import type { BatchExecutionResult } from "./results";

export function buildBatchContinuationHints(result: BatchExecutionResult): string[] {
	if (result.haltedPrematurely) {
		const retryIndex = result.haltedAtIndex ?? result.completedCount;
		return [
			`Fix the failing step and call batch_queue again with the remaining actions, starting around index ${retryIndex}.`,
		];
	}
	const changed = result.results.some((r) => r.type === "apply_diff" && r.applied);
	return changed
		? ["Workspace changed (apply_diff applied). Re-read affected files before you rely on earlier reads."]
		: [];
}

function oneLine(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function codeFence(language: string, text: string): string[] {
	return [`\`\`\`${language}`, text, "\`\`\`"];
}

function collapsibleBlock(title: string, language: string, text: string): string[] {
	return ["<details>", `<summary>${title}</summary>`, "", ...codeFence(language, text), "", "</details>"];
}

function formatActionResultLines(actionResult: BatchExecutionResult["results"][number]): string[] {
	const ok = actionResult.success ? "✅" : "❌";
	const exit = actionResult.exitCode === 0 ? "" : ` exit=${actionResult.exitCode}`;
	const lines: string[] = [`#### ${ok} [${actionResult.index}] ${actionResult.type}${exit}`];
	if (actionResult.error) {
		lines.push("", `**Error:** ${actionResult.error}`);
	}

	const detailLines = matchActionExecutionResult(actionResult, {
		read_lines: (result) => {
			const range = result.requestedRange
				? `:${result.requestedRange.startLine}-${result.requestedRange.endLine}`
				: "";
			const lines = [`${result.path}${range}`];
			if (result.formatted) {
				lines.push("", ...codeFence("text", result.formatted));
			}
			return lines;
		},
		grep_pattern: (result) => {
			const lines = [`/${oneLine(result.pattern)}/ (${result.matchCount} matches)`];
			if (result.matches.length > 0) {
				lines.push(
					"",
					...codeFence("text", result.matches.slice(0, 20).map((match) => `${match.path}:${match.lineNumber}: ${match.text}`).join("\n")),
				);
			}
			return lines;
		},
		execute_bash: (result) => {
			const output = codeFence("bash", result.command);
			if (result.stdout.text) {
				output.push("", ...collapsibleBlock("stdout", "text", result.stdout.text));
			}
			if (result.stderr.text) {
				output.push("", ...collapsibleBlock("stderr", "text", result.stderr.text));
			}
			return output;
		},
		apply_diff: (result) => [
			`${result.path} (${result.applied ? "applied" : "not applied"})`,
			`applied=${result.applied} strategy=${result.matchStrategy ?? "n/a"} bytes ${result.bytesBefore}->${result.bytesAfter}`,
		],
	});
	lines.push("", ...detailLines);
	return lines;
}

export function formatBatchResult(result: BatchExecutionResult): string {
	const status = result.haltedPrematurely
		? `❌ batch halted at action ${result.haltedAtIndex ?? "?"} (${result.haltReason})`
		: "✅ batch completed";
	const lines: string[] = [
		`${status} (${result.completedCount}/${result.totalRequested} actions, ${result.durationMs}ms)`,
		"",
		`- cwd: \`${result.shellState.cwd}\``,
	];
	if (result.error) {
		lines.push(`- error: ${result.error}`);
	}

	if (result.results.length > 0) {
		lines.push("", "### Executed actions");
		for (const actionResult of result.results) {
			lines.push("", ...formatActionResultLines(actionResult));
		}
	}

	const hints = buildBatchContinuationHints(result);
	if (hints.length > 0) {
		lines.push("", "### Next steps", ...hints.map((hint) => `- ${hint}`));
	}

	return lines.join("\n");
}
