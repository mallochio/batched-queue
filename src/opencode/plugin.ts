import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import type { Event } from "@opencode-ai/sdk";
import { tool } from "@opencode-ai/plugin";
import {
	type BatchQueueConfig,
	resolveBatchQueueConfig,
	type ResolvedBatchQueueConfig,
} from "../config.js";
import {
	createRunnerMap,
	executeBatchQueue,
} from "../execute-batch-queue.js";
import { loadOpenCodeFileConfig } from "../file-config.js";
import { configuredExecutionModelDescription } from "../planning-model.js";
import { buildBatchQueueDescription } from "../tool-description.js";
import { analyzeOpenCodeBatchObjective } from "./analyzer.js";
import { createBatchQueueZodArgs } from "./schemas-zod.js";

type OpenCodeClient = PluginInput["client"];

function openCodeDriverDescription(): string {
	return "OpenCode session model (selected in opencode.json or per session)";
}

function sessionIdFromDeletedEvent(event: Event): string | undefined {
	if (event.type !== "session.deleted") {
		return undefined;
	}
	return event.properties.info.id;
}

export function createBatchedQueuePluginHooks(
	resolvedConfig: ResolvedBatchQueueConfig,
	client: OpenCodeClient,
) {
	const runners = createRunnerMap();

	return {
		event: async ({ event }: { readonly event: Event }) => {
			const sessionID = sessionIdFromDeletedEvent(event);
			if (!sessionID) {
				return;
			}
			const runner = runners.get(sessionID);
			if (runner) {
				await runner.dispose();
				runners.delete(sessionID);
			}
		},
		tool: {
			batch_queue: tool({
				description: buildBatchQueueDescription(
					resolvedConfig,
					openCodeDriverDescription(),
				),
				args: createBatchQueueZodArgs(resolvedConfig),
				async execute(args, context) {
					const executeResult = await executeBatchQueue({
						config: resolvedConfig,
						params: args,
						runners,
						signal: context.abort,
						deps: {
							getSessionId: () => context.sessionID,
							getCwd: () => context.directory,
							resolveObjective: (objective, signal) =>
								analyzeOpenCodeBatchObjective(
									client,
									context.sessionID,
									objective,
									resolvedConfig,
									signal,
								),
						},
					});

					if (executeResult.isError) {
						return `ERROR: ${executeResult.text}`;
					}
					return executeResult.text;
				},
			}),
		},
	};
}

export const BatchedQueuePlugin: Plugin = async ({ client, directory }) => {
	const resolvedConfig = resolveBatchQueueConfig({}, loadOpenCodeFileConfig({ cwd: directory }));
	return createBatchedQueuePluginHooks(resolvedConfig, client);
};

export function registerBatchedQueueOpenCodePlugin(
	config: BatchQueueConfig = {},
	directory?: string,
) {
	const resolvedConfig = resolveBatchQueueConfig(
		config,
		loadOpenCodeFileConfig({ cwd: directory }),
	);
	return {
		resolvedConfig,
		createHooks: (client: OpenCodeClient) =>
			createBatchedQueuePluginHooks(resolvedConfig, client),
	};
}