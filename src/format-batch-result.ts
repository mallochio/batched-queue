import { matchActionExecutionResult } from "./guards";
import type { BatchExecutionResult } from "./results";

export interface FormatBatchResultOptions {
	readonly rationale?: string;
	readonly usedObjective?: boolean;
}

function batchChangedWorkspace(result: BatchExecutionResult): boolean {
	return result.results.some((actionResult) =>
		actionResult.type === "apply_diff" && actionResult.applied,
	);
}

export function buildBatchContinuationHints(
	result: BatchExecutionResult,
	options: FormatBatchResultOptions = {},
): string[] {
	const hints: string[] = [];

	if (options.rationale?.trim()) {
		hints.push(`plan rationale: ${options.rationale.trim()}`);
	}

	if (result.haltedPrematurely) {
		const retryIndex = result.haltedAtIndex ?? result.completedCount;
		hints.push(
			`Replan: fix the failing step and call batch_queue again with explicit actions starting around index ${retryIndex}, or pass a refined objective.`,
		);
		return hints;
	}

	if (batchChangedWorkspace(result)) {
		hints.push(
			"Workspace changed (apply_diff applied). Re-read affected files or replan before assuming prior reads are current.",
		);
	}

	if (options.usedObjective) {
		hints.push(
			"If the objective is not satisfied, call batch_queue again with a refined objective or switch to explicit actions for the next steps.",
		);
	} else {
		hints.push(
			"If more sequential steps remain, call batch_queue again with a follow-up objective (preferred) or explicit actions when exact steps are required.",
		);
	}

	return hints;
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

export interface FormatBatchResultPreviewOptions extends FormatBatchResultOptions {
	readonly expanded?: boolean;
}

function oneLine(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function formatActionTarget(actionResult: BatchExecutionResult["results"][number]): string {
	return matchActionExecutionResult(actionResult, {
		read_lines: (result) => {
			const range = result.requestedRange
				? `:${result.requestedRange.startLine}-${result.requestedRange.endLine}`
				: "";
			return `${result.path}${range}`;
		},
		grep_pattern: (result) => `/${oneLine(result.pattern)}/ (${result.matchCount} matches)`,
		execute_bash: (result) => oneLine(result.command),
		apply_diff: (result) => `${result.path} (${result.applied ? "applied" : "not applied"})`,
	});
}

function formatActionLabel(actionResult: BatchExecutionResult["results"][number]): string {
	return matchActionExecutionResult(actionResult, {
		read_lines: () => "read",
		grep_pattern: () => "grep",
		execute_bash: () => "bash",
		apply_diff: () => "patch",
	});
}

function formatActionSummary(actionResult: BatchExecutionResult["results"][number]): string {
	const status = actionResult.success ? "✓" : "✗";
	const exit = actionResult.exitCode === 0 ? "" : ` exit=${actionResult.exitCode}`;
	return `${status} ${String(actionResult.index).padStart(2, " ")} ${formatActionLabel(actionResult).padEnd(5)} ${formatActionTarget(actionResult)}${exit}`;
}

export function formatBatchResultPreview(
	result: BatchExecutionResult,
	options: FormatBatchResultPreviewOptions = {},
): string {
	if (options.expanded) {
		return formatBatchResult(result, options);
	}

	const lines = [
		result.haltedPrematurely
			? `✗ batch halted at action ${result.haltedAtIndex ?? "?"} (${result.haltReason})`
			: "✓ batch completed",
		`${result.completedCount}/${result.totalRequested} actions in ${result.durationMs}ms`,
		`cwd: ${result.shellState.cwd}`,
	];

	if (result.results.length > 0) {
		lines.push("actions:");
		for (const actionResult of result.results) {
			lines.push(`  ${formatActionSummary(actionResult)}`);
		}
	}

	const hints = buildBatchContinuationHints(result, options);
	if (hints.length > 0) {
		lines.push(`next: ${hints[0]}`);
	}

	return lines.join("\n");
}

export function formatBatchResult(
	result: BatchExecutionResult,
	options: FormatBatchResultOptions = {},
): string {
	const status = result.haltedPrematurely
		? `❌ batch halted at action ${result.haltedAtIndex ?? "?"} (${result.haltReason})`
		: "✅ batch completed";
	const lines: string[] = [
		`${status} (${result.completedCount}/${result.totalRequested} actions, ${result.durationMs}ms)`,
		"",
		`- cwd: \`${result.shellState.cwd}\``,
	];

	const hints = buildBatchContinuationHints(result, options);
	if (result.results.length > 0) {
		lines.push("", "### Executed actions");
		for (const actionResult of result.results) {
			lines.push("", ...formatActionResultLines(actionResult));
		}
	}

	if (hints.length > 0) {
		lines.push("", "### Next steps");
		for (const hint of hints) {
			lines.push(`- ${hint}`);
		}
	}

	return lines.join("\n");
}
