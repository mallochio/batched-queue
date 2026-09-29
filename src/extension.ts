/**
 * Prime Agent extension: registers the `batch_queue` tool.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
	BATCH_QUEUE_DESCRIPTION,
	BATCH_QUEUE_GUIDELINES,
	BatchQueueRunners,
	executeBatchQueue,
} from "./execute-batch-queue";
import type { BatchExecutionResult } from "./results";
import { BatchQueueParamsSchema } from "./schemas";

const ACTION_LABELS: Record<string, string> = {
	read_lines: "read",
	grep_pattern: "grep",
	execute_bash: "bash",
	apply_diff: "edit",
};

function actionChain(args: { actions?: readonly { type?: string }[] } | undefined): string {
	return (args?.actions ?? []).map((a) => ACTION_LABELS[a.type ?? ""] ?? "?").join(" → ");
}

function formatMs(ms: number): string {
	return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export default function batchedQueueExtension(api: ExtensionAPI) {
	const runners = new BatchQueueRunners();

	api.on("session_before_switch", async () => {
		await runners.disposeAll();
	});
	api.on("session_shutdown", async () => {
		await runners.disposeAll();
	});

	api.registerTool({
		name: "batch_queue",
		label: "Batch Queue",
		description: BATCH_QUEUE_DESCRIPTION,
		promptSnippet: "Run known dependent repo steps (edit → lint → test) in one batch_queue call.",
		promptGuidelines: [...BATCH_QUEUE_GUIDELINES],
		parameters: BatchQueueParamsSchema,

		renderShell: "self",

		renderCall(args, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			// Once the result arrives, its row replaces this one.
			text.setText(context.state.done ? "" : `${theme.fg("muted", "◇ batch")} ${theme.fg("dim", actionChain(args))}`);
			return text;
		},

		renderResult(result, options, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			if (options.isPartial) return text;
			context.state.done = true;
			const details = result.details as BatchExecutionResult | undefined;
			const first = result.content[0];
			const body = first?.type === "text" ? first.text : "";
			const failed = context.isError || details?.haltedPrematurely === true;
			const header = [
				`${failed ? theme.fg("error", "✗") : theme.fg("success", "✓")} ${theme.fg("muted", "batch")}`,
				theme.fg("dim", actionChain(context.args)),
			];
			if (details) {
				header.push(theme.fg("dim", `${details.completedCount}/${details.totalRequested} actions`));
				header.push(theme.fg("dim", formatMs(details.durationMs)));
			}
			// Collapsed: one row, plus the failing action. Expanded: the full result below the row.
			const rest = body.split("\n").slice(1);
			const extra = options.expanded ? rest.filter((line) => line !== "```") : rest.filter((line) => /^\[\d+\] ✗/.test(line));
			const indent = (line: string) => `  ${theme.fg(/^\[\d+\] ✗/.test(line) ? "error" : "toolOutput", line)}`;
			text.setText([header.join(theme.fg("dim", " · ")), ...extra.map(indent)].join("\n"));
			return text;
		},

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { text, isError, result } = await executeBatchQueue(
				params,
				{ sessionId: ctx.sessionManager.getSessionId(), cwd: ctx.cwd },
				runners,
			);
			return { content: [{ type: "text", text }], details: result, isError };
		},
	});
}
