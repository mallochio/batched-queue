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
import type { PlanReflection } from "./payload";
import type { BatchExecutionResult } from "./results";
import type { PlannerUsage } from "./planner-usage";
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
	readonly rationale?: string;
	readonly reflection?: PlanReflection;
	readonly result: BatchExecutionResult;
	readonly plannerUsage?: PlannerUsage;
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
			"Run 2+ dependent repo steps (read → grep → bash) in one call instead of several separate tool calls.",
		promptGuidelines: [
			"Use batch_queue strictly for 2+ dependent repo steps (e.g. read_lines → apply_diff → execute_bash). NEVER call batch_queue for a single action; use native bash, read, or edit tools instead.",
			"Pass `actions` for a deterministic sequence. Pass `objective` to delegate multi-step exploration, inspection, or fix tasks to the execution planner.",
			resolvedConfig.allowObjectiveMutations
				? "Objective mode supports full multi-step inspection, editing (apply_diff), and test verification."
				: "Objective mode is read/check-only by default; use explicit actions for mutations.",
			"In execute_bash, append '|| true' if a command is expected or allowed to return a non-zero exit code, to prevent premature batch halts.",
			"Use `bindTo` to name a step's output and reference it in a later step as `${name}`; quote it in shell commands since it's raw text.",
			"Keep actions short and non-interactive; route destructive or long-running commands through native tools.",
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
						const label =
							theme.fg(color, ok) +
							" " +
							theme.fg("muted", "[" + String(action.index) + "]") +
							" " +
							theme.fg("toolOutput", action.type) +
							theme.fg(color, exit);
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

				const hints = buildBatchContinuationHints(batch, {
					rationale: details.rationale,
					reflection: details.reflection,
					usedObjective,
				});
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
					resolveObjective: async (objective, sig) => {
						const { payload, plannerUsage } = await analyzeBatchObjective(
							objective,
							driverModel,
							ctx.modelRegistry,
							resolvedConfig,
							ctx.cwd,
							sig,
						);
						return { payload, plannerUsage };
					},
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
					rationale: executeResult.rationale,
					reflection: executeResult.reflection,
					result: executeResult.result,
					plannerUsage: executeResult.plannerUsage,
				} satisfies BatchQueueToolDetails,
				isError: executeResult.isError,
			};
		},
	});
}

export default function initializeBatchedQueueExtension(pi: ExtensionAPI) {
	registerBatchedQueueExtension(pi, {
		// Uncomment or override via env vars (see config.ts):
		// maxBatchActions: 15,
		// executionModel: "openai/gpt-5.4-nano",
	});
}
