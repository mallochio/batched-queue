import { Plugin } from "@opencode/plugin";
import {
	type BatchQueueConfig,
	resolveBatchQueueConfig,
	type ResolvedBatchQueueConfig,
} from "../config.js";
import {
	type BatchQueueToolParams,
	createRunnerMap,
	disposeAllRunners,
	executeBatchQueue,
} from "../execute-batch-queue.js";
import { loadOpenCodeFileConfig } from "../file-config.js";
import { buildBatchQueueDescription } from "../tool-description.js";
import { analyzeOpenCodeV2BatchObjective, openCodeSessionDirectory } from "./analyzer-v2.js";
import { createBatchQueueJsonSchema, OPENCODE_V2_SCHEMA_MAX_ACTIONS } from "./schemas-json.js";

function openCodeDriverDescription(): string {
	return "OpenCode session model (selected in opencode.json or per session)";
}

/**
 * OpenCode V2 plugin definition (`Plugin.define` + `setup`).
 * Registers `batch_queue` through `ctx.tool.transform` per OpenCode v2 docs.
 */
export function createBatchedQueueV2Plugin(config: BatchQueueConfig = {}) {
	return Plugin.define({
		id: "batched-queue",
		async setup(ctx) {
			const packageConfig: ResolvedBatchQueueConfig = resolveBatchQueueConfig(
				config,
				loadOpenCodeFileConfig({ projectConfigPath: "/batched-queue-no-project-config.json" }),
			);
			const runners = createRunnerMap();
			const description = buildBatchQueueDescription(
				packageConfig,
				openCodeDriverDescription(),
			);
			const inputSchema = createBatchQueueJsonSchema({
				...packageConfig,
				maxBatchActions: Math.max(packageConfig.maxBatchActions, OPENCODE_V2_SCHEMA_MAX_ACTIONS),
			});

			await ctx.tool.transform((editor) => {
				editor.add({
					name: "batch_queue",
					description,
					input: inputSchema,
					async execute(input, toolCtx) {
						let cwd: string;
						let resolvedConfig: ResolvedBatchQueueConfig;
						try {
							const session = await ctx.session.get({ sessionID: toolCtx.sessionID });
							cwd = openCodeSessionDirectory(session);
							resolvedConfig = resolveBatchQueueConfig(
								config,
								loadOpenCodeFileConfig({ cwd }),
							);
						} catch (error) {
							const message = error instanceof Error ? error.message : String(error);
							return { content: `ERROR: ${message}` };
						}
						const params = input as BatchQueueToolParams;
						const executeResult = await executeBatchQueue({
							config: resolvedConfig,
							params,
							runners,
							signal: toolCtx.signal,
							deps: {
								getSessionId: () => toolCtx.sessionID,
								getCwd: () => cwd,
								resolveObjective: (objective) =>
									analyzeOpenCodeV2BatchObjective(
										{
											sessionGet: (args) => ctx.session.get(args),
											generateText: (args) => ctx.generate.text(args),
										},
										toolCtx.sessionID,
										objective,
										resolvedConfig,
									),
							},
						});

						if (executeResult.isError) {
							return { content: `ERROR: ${executeResult.text}` };
						}
						return { content: executeResult.text };
					},
				});
			});

			const controller = new AbortController();
			void (async () => {
				try {
					for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
						if (event.type !== "session.deleted") {
							continue;
						}
						const sessionID =
							"data" in event && event.data && typeof event.data === "object"
								? (event.data as { sessionID?: string }).sessionID
								: undefined;
						if (!sessionID) {
							continue;
						}
						const runner = runners.get(sessionID);
						if (runner) {
							await runner.dispose();
							runners.delete(sessionID);
						}
					}
				} catch {
					// Subscription aborted on plugin unload.
				}
			})();

			return async () => {
				controller.abort();
				await disposeAllRunners(runners);
			};
		},
	});
}

export const BatchedQueueV2Plugin = createBatchedQueueV2Plugin();
