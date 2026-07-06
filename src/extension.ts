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
import { resolvePlanningModelRef } from "./planning-model";
import { buildBatchQueueDescription } from "./tool-description";

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
			"Batch up to 10 safe sequential repo actions: read, grep, short bash, or targeted diff",
		promptGuidelines: [
			"RGB-style loop: plan explicit batch_queue actions, execute with zero per-action LLM calls, then replan when results change or more steps remain.",
			"Prefer explicit batch_queue actions when the exact steps are known, especially for apply_diff.",
			"Use batch_queue objective only when the goal is clear but enumerating steps is tedious; the session driver plans by default.",
			"After a batch completes, read the next-steps hints and call batch_queue again if the task is not finished.",
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
