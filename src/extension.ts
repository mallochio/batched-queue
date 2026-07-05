/**
 * Pi extension — stateful batched action queue with driver/executor model split.
 *
 * - Driver model: the main model selected in Pi (ctx.model) — invokes this tool
 * - Executor model: configurable fast model that plans action batches from objectives
 *
 * Configuration (in priority order, highest wins):
 * - extension factory overrides
 * - environment variables (BATCH_QUEUE_*)
 * - project `.pi/batched-queue.json`
 * - package.json `pi.batchQueue`
 */

import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
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
import { buildBatchQueueDescription } from "./tool-description";

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
		return `${config.executorModel.provider}/${config.executorModel.id} (configured executor model)`;
	}
	return "Pi session driver model (default; set executor in .pi/batched-queue.json, package.json pi.batchQueue, or BATCH_QUEUE_EXECUTOR)";
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
		`Driver model: Pi session model (ctx.model).\nExecutor model: ${executorDescription(resolvedConfig)}`,
	);

	pi.registerTool({
		name: "batch_queue",
		label: "Batch Queue",
		description,
		promptSnippet:
			"Batch 1-5 safe sequential repo actions: read, grep, short bash, or targeted diff",
		promptGuidelines: [
			"Use batch_queue for 2-5 safe sequential repo actions such as read, grep, and short checks.",
			"Prefer explicit batch_queue actions when the exact steps are known.",
			"Use batch_queue objective for read/check-only planning; pass explicit actions for apply_diff unless allowObjectiveMutations is enabled.",
			"Do not use batch_queue for long-running, interactive, destructive, or judgment-dependent steps.",
		],
		executionMode: "sequential",

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

			const executorModel = resolveExecutorRef(driverModel, resolvedConfig);

			return {
				content: [{ type: "text", text: executeResult.text }],
				details: {
					driverModel: {
						provider: driverModel.provider,
						id: driverModel.id,
					},
					executorModel,
					maxBatchActions: resolvedConfig.maxBatchActions,
					result: executeResult.result!,
				} satisfies BatchQueueToolDetails,
				isError: executeResult.isError,
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
