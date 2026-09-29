import { matchActionExecutionResult } from "./guards";
import type { ActionExecutionResult, BatchExecutionResult } from "./results";

const FENCE = "```";

export function buildBatchContinuationHints(result: BatchExecutionResult): string[] {
	if (result.haltedPrematurely) {
		const failed = result.haltedAtIndex ?? result.completedCount;
		const notRun = result.totalRequested - result.completedCount;
		const last = result.totalRequested - 1;
		const range = notRun === 1 ? `Action ${last}` : `Actions ${result.completedCount}-${last}`;
		const skipped = notRun > 0 ? ` ${range} did not run.` : "";
		return [`Action ${failed} failed.${skipped} Fix the cause, then resend only the remaining steps.`];
	}
	const changed = result.results.some((r) => r.type === "apply_diff" && r.applied);
	return changed ? ["Files changed. Re-read them before you rely on earlier reads."] : [];
}

function oneLine(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function block(text: string): string[] {
	return [FENCE, text, FENCE];
}

function formatAction(action: ActionExecutionResult): string[] {
	const mark = action.success ? "✓" : "✗";
	const exit = action.exitCode === 0 ? "" : ` (exit ${action.exitCode})`;
	const { title, body } = matchActionExecutionResult<{ title: string; body: string[] }>(action, {
		read_lines: (r) => {
			const range = r.requestedRange ? `:${r.requestedRange.startLine}-${r.requestedRange.endLine}` : "";
			return { title: `read ${r.path}${range}`, body: r.formatted ? block(r.formatted) : [] };
		},
		grep_pattern: (r) => {
			const more = r.truncated ? ", more not shown" : "";
			const matches = r.matches.map((m) => `${m.path}:${m.lineNumber}${m.isContext ? "-" : ":"} ${m.text}`);
			return {
				title: `grep /${oneLine(r.pattern)}/ (${r.matchCount} matches${more})`,
				body: matches.length > 0 ? block(matches.join("\n")) : [],
			};
		},
		execute_bash: (r) => {
			const body: string[] = [];
			if (r.stdout.text) body.push(...block(r.stdout.text));
			if (r.stderr.text) body.push("stderr:", ...block(r.stderr.text));
			return { title: `bash \`${oneLine(r.command)}\``, body };
		},
		apply_diff: (r) => ({
			title: `edit ${r.path} (${r.applied ? `applied, ${r.matchStrategy ?? "exact"} match` : "not applied"})`,
			body: r.validationErrors?.length ? block(r.validationErrors.join("\n")) : [],
		}),
	});
	const lines = [`[${action.index}] ${mark} ${title}${exit}`];
	if (action.error && !action.success) lines.push(`error: ${action.error}`);
	return [...lines, ...body];
}

/** Compact, fixed-layout result text for the model. */
export function formatBatchResult(result: BatchExecutionResult): string {
	const status = result.haltedPrematurely
		? `✗ batch halted at action ${result.haltedAtIndex ?? "?"} (${result.haltReason})`
		: "✓ batch completed";
	const lines = [
		`${status}: ${result.completedCount}/${result.totalRequested} actions, ${result.durationMs}ms, cwd ${result.shellState.cwd}`,
	];
	if (result.error) lines.push(`error: ${result.error}`);
	for (const action of result.results) lines.push(...formatAction(action));
	for (const hint of buildBatchContinuationHints(result)) lines.push(`next: ${hint}`);
	return lines.join("\n");
}
