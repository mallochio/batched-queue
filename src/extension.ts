/**
 * Pi extension — stateful batched action queue with planner / execution model split.
 *
 * - Planner / driver model: the main model selected in Pi (ctx.model) — invokes and replans
 * - Execution model: optional cheap model for objective→actions conversion when configured
 *
 * Configuration (in priority order, highest wins):
 * - extension factory overrides
 * - environment variables (BATCH_QUEUE_*)
 * - project `.pi/batched-queue.json`
 * - package.json `pi.batchQueue`
 */

import type { Api, Model } from "@earendil-works/pi-ai";
import { highlightCode, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
	type BatchQueueConfig,
	resolveBatchQueueConfig,
	type ModelRef,
	type ResolvedBatchQueueConfig,
} from "./config";
import { loadFileConfig } from "./file-config";
import { analyzeBatchObjective, createBatchQueueToolParameters } from "./analyzer";
import type { BatchExecutionResult } from "./results";
import {
	createRunnerMap,
	disposeAllRunners,
	executeBatchQueue,
} from "./execute-batch-queue";
import { resolvePlanningModelRef } from "./planning-model";
import { buildBatchQueueDescription } from "./tool-description";
import { buildBatchContinuationHints } from "./format-batch-result";

interface BatchQueueToolDetails {
	readonly driverModel: { readonly provider: string; readonly id: string };
	readonly planningModel: ModelRef;
	readonly maxBatchActions: number;
	readonly result: BatchExecutionResult;
}

interface BatchQueueToolErrorDetails {
	readonly error: string;
}

export function registerBatchedQueueExtension(
	pi: ExtensionAPI,
	config: BatchQueueConfig = {},
) {
	const resolvedConfig: ResolvedBatchQueueConfig = resolveBatchQueueConfig(
		config,
		loadFileConfig(),
	);
	const runners = createRunnerMap();

	pi.on("session_before_switch", async () => {
		await disposeAllRunners(runners);
	});

	pi.on("session_shutdown", async () => {
		await disposeAllRunners(runners);
	});

	const description = buildBatchQueueDescription(
		resolvedConfig,
		"Pi session model (ctx.model)",
	);

	pi.registerTool({
		name: "batch_queue",
		label: "Batch Queue",
		description,
		promptSnippet:
			"Batch repo work by describing an objective; the tool plans and runs safe sequential read/grep/bash actions.",
		promptGuidelines: [
			"Prefer batch_queue with `objective` for multi-step repo inspection, verification, and read/check workflows.",
			"Use explicit `actions` only when exact ordered commands/paths are already known, or when apply_diff is required.",
			"Objective mode is read/check-only by default; use explicit actions for mutations unless objective mutations are enabled.",
			"After a batch completes, read the next-steps hints and call batch_queue again if the task is not finished.",
			"Do not use batch_queue for long-running, interactive, destructive, or approval-sensitive commands.",
		],
		executionMode: "sequential",

		parameters: createBatchQueueToolParameters(resolvedConfig.maxBatchActions),

		renderCall(args, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			if (args.actions?.length) {
				const actionTypes = args.actions
					.map((action: { type?: string }) => action.type ?? "?")
					.join(" → ");
				text.setText(
					theme.fg("toolTitle", theme.bold("batch_queue")) +
						theme.fg("toolOutput", ` ${args.actions.length} actions: ${actionTypes}`),
				);
				return text;
			}
			const objective = (args.objective ?? "").trim();
			text.setText(
				theme.fg("toolTitle", theme.bold("batch_queue")) +
					theme.fg("toolOutput", ` objective: ${objective || "..."}`),
			);
			return text;
		},

		renderResult(result, opts, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			const details = result.details as BatchQueueToolDetails | BatchQueueToolErrorDetails | undefined;
			if (details && "result" in details) {
				const batch = details.result;
				const usedObjective = Boolean(context.args?.objective?.trim()) && !context.args?.actions?.length;

				const statusIcon = batch.haltedPrematurely ? "✗" : "✓";
				const statusText = batch.haltedPrematurely ? `batch halted at action ${batch.haltedAtIndex ?? "?"} (${batch.haltReason})` : "batch completed";
				const statusColor = batch.haltedPrematurely ? "error" : "success";

				const lines = [
					theme.fg(statusColor, `${statusIcon} ${statusText}`) + theme.fg("muted", ` (${batch.completedCount}/${batch.totalRequested} actions, ${batch.durationMs}ms)`),
					theme.fg("muted", `  cwd:   ${batch.shellState.cwd}`),
				];

				if (usedObjective) {
					const thinkingStr = resolvedConfig.executorThinking ? ` (reasoning: ${resolvedConfig.executorThinking})` : "";
					lines.push(theme.fg("muted", `  model: ${details.planningModel.provider}/${details.planningModel.id}${thinkingStr}`));
				}

				if (batch.results.length > 0) {
					lines.push("", theme.fg("border", "─── ") + theme.fg("toolTitle", theme.bold("Executed Actions ")) + theme.fg("border", "─────────────────────"), "");
					for (const action of batch.results) {
						const ok = action.success ? "✓" : "✗";
						const color = action.success ? "success" : "error";
						const exit = action.exitCode === 0 ? "" : ` exit=${action.exitCode}`;
						const label = `${theme.fg(color, ok)} ${theme.fg("muted", `[${action.index}]`)} ${theme.fg("toolOutput", action.type)}${theme.fg(color, exit)}`;
						lines.push(label);

						let bodyLines: string[] = [];
						if (action.type === "execute_bash") {
							bodyLines = highlightCode(action.command, "bash");
						} else if (action.type === "read_lines") {
							const range = action.requestedRange ? `:${action.requestedRange.startLine}-${action.requestedRange.endLine}` : "";
							bodyLines = [theme.fg("toolOutput", `${action.path}${range}`)];
						} else if (action.type === "grep_pattern") {
							bodyLines = [theme.fg("toolOutput", `/${action.pattern}/ (${action.matchCount} matches)`)];
						} else {
							bodyLines = [theme.fg("toolOutput", `${action.path} (${action.applied ? "applied" : "not applied"})`)];
						}

						lines.push(...bodyLines.map(l => `  ${l}`), "");
					}
				}

				const hints = buildBatchContinuationHints(batch, { usedObjective });
				if (hints.length > 0) {
					if (batch.results.length === 0) lines.push("");
					lines.push(theme.fg("border", "─── ") + theme.fg("toolTitle", theme.bold("Next Steps ")) + theme.fg("border", "───────────────────────────"));
					for (const hint of hints) {
						lines.push(theme.fg("toolOutput", `• ${hint}`));
					}
				}

				text.setText(lines.join("\n"));
				return text;
			}

			const content = result.content[0];
			text.setText(theme.fg(context.isError ? "error" : "toolOutput", content?.type === "text" ? content.text : ""));
			return text;
		},

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const driverModel: Model<Api> | undefined = ctx.model;

			if (!driverModel) {
				return {
					content: [{ type: "text", text: "batch_queue requires an active driver model (main Pi model)" }],
					details: { error: "missing driver model" } satisfies BatchQueueToolErrorDetails,
					isError: true,
				};
			}

			const executeResult = await executeBatchQueue({
				config: resolvedConfig,
				params,
				signal,
				runners,
				deps: {
					getSessionId: () => ctx.sessionManager.getSessionId(),
					getCwd: () => ctx.cwd,
					resolveObjective: (objective) =>
						analyzeBatchObjective(
							objective,
							driverModel,
							ctx.modelRegistry,
							resolvedConfig,
							signal,
						),
				},
			});

			if (executeResult.error && !executeResult.result) {
				return {
					content: [{ type: "text", text: executeResult.text }],
					details: { error: executeResult.error } satisfies BatchQueueToolErrorDetails,
					isError: executeResult.isError,
				};
			}

			if (!executeResult.result) {
				return {
					content: [{ type: "text", text: executeResult.text }],
					details: { error: "missing batch result" } satisfies BatchQueueToolErrorDetails,
					isError: true,
				};
			}

			const planningModel = resolvePlanningModelRef(
				{ provider: driverModel.provider, id: driverModel.id },
				resolvedConfig,
			);

			return {
				content: [{ type: "text", text: executeResult.text }],
				details: {
					driverModel: {
						provider: driverModel.provider,
						id: driverModel.id,
					},
					planningModel,
					maxBatchActions: resolvedConfig.maxBatchActions,
					result: executeResult.result,
				} satisfies BatchQueueToolDetails,
				isError: executeResult.isError,
			};
		},
	});
}

export default function (pi: ExtensionAPI) {
	registerBatchedQueueExtension(pi, {
		// Uncomment or override via env vars (see config.ts):
		// maxBatchActions: 15,
		// executionModel: "openai/gpt-5.4-nano",
	});
}
