/**
 * Pi extension — stateful batched action queue with driver/executor model split.
 *
 * - Driver model: the main model selected in Pi (ctx.model) — invokes this tool
 * - Executor model: configurable fast model that plans action batches from objectives
 *
 * Configuration (extension factory config, env vars, or both):
 * - maxBatchActions / BATCH_QUEUE_MAX_ACTIONS (default 5)
 * - executorModel / BATCH_QUEUE_EXECUTOR_PROVIDER + BATCH_QUEUE_EXECUTOR_MODEL
 * - BATCH_QUEUE_EXECUTOR=provider/model shorthand
 */

import type { Api, Model } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import {
	type BatchQueueConfig,
	resolveBatchQueueConfig,
	type ModelRef,
	type ResolvedBatchQueueConfig,
} from "./config";
import { analyzeBatchObjective, createBatchQueueToolParameters } from "./analyzer";
import { parseActionBatchPayloadWithConfig } from "./guards";
import type { ActionBatchPayload } from "./payload";
import type { BatchExecutionResult } from "./results";
import { BatchQueueRunner } from "./queue-runner";

interface BatchQueueToolDetails {
	readonly driverModel: { readonly provider: string; readonly id: string };
	readonly executorModel: ModelRef;
	readonly maxBatchActions: number;
	readonly result: BatchExecutionResult;
}

interface BatchQueueToolErrorDetails {
	readonly error: string;
}

function resolveExecutorRef(
	driverModel: Model<Api>,
	config: ResolvedBatchQueueConfig,
): ModelRef {
	return config.executorModel ?? {
		provider: driverModel.provider,
		id: driverModel.id,
	};
}

function executorDescription(config: ResolvedBatchQueueConfig): string {
	if (config.executorModel) {
		return `${config.executorModel.provider}/${config.executorModel.id} (BATCH_QUEUE_EXECUTOR override)`;
	}
	return "Pi session driver model (default; set BATCH_QUEUE_EXECUTOR to override)";
}

function formatBatchResult(result: BatchExecutionResult): string {
	const lines: string[] = [];
	lines.push(
		result.haltedPrematurely
			? `batch halted at action ${result.haltedAtIndex ?? "?"} (${result.haltReason})`
			: "batch completed successfully",
	);
	lines.push(`completed ${result.completedCount}/${result.totalRequested} actions in ${result.durationMs}ms`);
	lines.push(`shell cwd: ${result.shellState.cwd}`);

	for (const actionResult of result.results) {
		lines.push("");
		lines.push(
			`[${actionResult.index}] ${actionResult.type} exit=${actionResult.exitCode} ${actionResult.success ? "ok" : "FAIL"}`,
		);
		if (actionResult.error) {
			lines.push(`  error: ${actionResult.error}`);
		}
		switch (actionResult.type) {
			case "read_lines":
				if (actionResult.formatted) {
					lines.push(actionResult.formatted.split("\n").slice(0, 20).map((l) => `  ${l}`).join("\n"));
				}
				break;
			case "grep_pattern":
				for (const match of actionResult.matches.slice(0, 10)) {
					lines.push(`  ${match.path}:${match.lineNumber}: ${match.text}`);
				}
				break;
			case "execute_bash":
				if (actionResult.stdout.text) {
					lines.push(`  stdout:\n${actionResult.stdout.text.split("\n").map((l) => `    ${l}`).join("\n")}`);
				}
				if (actionResult.stderr.text) {
					lines.push(`  stderr:\n${actionResult.stderr.text.split("\n").map((l) => `    ${l}`).join("\n")}`);
				}
				break;
			case "apply_diff":
				lines.push(
					`  applied=${actionResult.applied} strategy=${actionResult.matchStrategy ?? "n/a"} bytes ${actionResult.bytesBefore}->${actionResult.bytesAfter}`,
				);
				break;
			default: {
				const _exhaustive: never = actionResult;
				void _exhaustive;
			}
		}
	}

	return lines.join("\n");
}

export function registerBatchedQueueExtension(
	pi: ExtensionAPI,
	config: BatchQueueConfig = {},
) {
	const resolvedConfig: ResolvedBatchQueueConfig = resolveBatchQueueConfig(config);
	const runners = new Map<string, BatchQueueRunner>();

	const disposeAllRunners = async () => {
		for (const sessionId of [...runners.keys()]) {
			const runner = runners.get(sessionId);
			if (runner) {
				await runner.dispose();
			}
			runners.delete(sessionId);
		}
	};

	const getRunner = (sessionId: string, cwd: string): BatchQueueRunner => {
		let runner = runners.get(sessionId);
		if (!runner) {
			runner = new BatchQueueRunner(sessionId, cwd, {
				pathSecurity: resolvedConfig.pathSecurity,
			});
			runners.set(sessionId, runner);
		} else {
			runner.syncWorkspaceRoot(cwd);
		}
		return runner;
	};

	pi.on("session_before_switch", async () => {
		await disposeAllRunners();
	});

	pi.on("session_shutdown", async () => {
		await disposeAllRunners();
	});

	pi.registerTool({
		name: "batch_queue",
		label: "Batch Queue",
		description:
			"Execute up to N sequential coding actions in one low-latency batch with persistent shell state.\n\n" +
			"For coding work, default to this tool for small sequential inspect/search/check loops instead of making multiple individual read, grep, or bash calls.\n" +
			`Maximum ${resolvedConfig.maxBatchActions} actions per batch (configurable).\n\n` +
			"Prefer this tool when you need 2-5 low-risk sequential repo actions, such as inspecting files, searching symbols/text, running small shell checks, applying a targeted diff, or verifying a local change.\n" +
			"Use `actions` when you already know the exact deterministic steps. Use `objective` when a cheaper executor model should plan the steps.\n" +
			"Prefer `multi_tool_use.parallel` instead for independent parallel reads/searches. Do not use this tool for destructive, long-running, interactive, or approval-sensitive commands.\n\n" +
			"Action types: read_lines, grep_pattern, execute_bash, apply_diff.\n" +
			"Fast-fail: batch halts on first non-zero exit or validation failure. File actions are workspace-scoped unless configured otherwise.\n" +
			"Driver model: Pi session model (ctx.model).\n" +
			`Executor model: ${executorDescription(resolvedConfig)}`,

		parameters: createBatchQueueToolParameters(resolvedConfig.maxBatchActions),

		renderCall(args, theme) {
			if (args.actions?.length) {
				return new Text(
					theme.fg("toolTitle", theme.bold(`batch_queue (${args.actions.length} actions)`)),
					0,
					0,
				);
			}
			const preview = (args.objective ?? "").split("\n")[0].slice(0, 80);
			return new Text(
				theme.fg("toolTitle", theme.bold(`batch_queue: ${preview || "..."}`)),
				0,
				0,
			);
		},

		renderResult(result, _opts, theme) {
			const content = result.content[0];
			const text = content?.type === "text" ? content.text : "";
			return new Text(theme.fg("toolOutput", text), 0, 0);
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

			let payload: ActionBatchPayload;

			try {
				if (params.actions && params.actions.length > 0) {
					payload = parseActionBatchPayloadWithConfig(
						{ actions: params.actions, batchId: params.batchId },
						resolvedConfig,
					);
				} else if (params.objective?.trim()) {
					payload = await analyzeBatchObjective(
						params.objective.trim(),
						driverModel,
						ctx.modelRegistry,
						resolvedConfig,
						signal,
					);
					if (params.batchId) {
						payload = { ...payload, batchId: params.batchId };
					}
				} else {
					return {
						content: [{
							type: "text",
							text: "batch_queue requires either `objective` (executor plans batch) or `actions` (driver supplies batch)",
						}],
						details: { error: "missing objective or actions" } satisfies BatchQueueToolErrorDetails,
						isError: true,
					};
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text", text: `batch_queue planning failed: ${message}` }],
					details: { error: message } satisfies BatchQueueToolErrorDetails,
					isError: true,
				};
			}

			const sessionId = ctx.sessionManager.getSessionId();
			const runner = getRunner(sessionId, ctx.cwd);
			const result = await runner.executeBatch(payload);
			const text = formatBatchResult(result);

			const executorModel = resolveExecutorRef(driverModel, resolvedConfig);

			return {
				content: [{ type: "text", text }],
				details: {
					driverModel: {
						provider: driverModel.provider,
						id: driverModel.id,
					},
					executorModel,
					maxBatchActions: resolvedConfig.maxBatchActions,
					result,
				} satisfies BatchQueueToolDetails,
				isError: result.haltedPrematurely,
			};
		},
	});
}

export default function (pi: ExtensionAPI) {
	registerBatchedQueueExtension(pi, {
		// Uncomment or override via env vars (see config.ts):
		// maxBatchActions: 10,
		// executorModel: { provider: "openrouter", id: "deepseek/deepseek-chat-v3-0324" },
	});
}
