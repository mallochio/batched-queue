import { Plugin } from "@opencode/plugin";
import {
	BATCH_QUEUE_DESCRIPTION,
	BatchQueueRunners,
	type BatchQueueToolParams,
	executeBatchQueue,
} from "../execute-batch-queue.js";
import { BatchQueueParamsSchema } from "../schemas.js";

function sessionDirectory(session: { readonly location?: { readonly directory?: string } | null }): string {
	const directory = session.location?.directory?.trim();
	if (!directory) {
		throw new Error("batch_queue requires the OpenCode session directory");
	}
	return directory;
}

/** OpenCode 2 plugin: registers `batch_queue` through `ctx.tool.transform`. */
export const BatchedQueuePlugin = Plugin.define({
	id: "batched-queue",
	async setup(ctx) {
		const runners = new BatchQueueRunners();
		const input = structuredClone(BatchQueueParamsSchema) as unknown as Record<string, unknown>;

		await ctx.tool.transform((editor) => {
			editor.add({
				name: "batch_queue",
				description: BATCH_QUEUE_DESCRIPTION,
				input,
				async execute(params, toolCtx) {
					let cwd: string;
					try {
						cwd = sessionDirectory(await ctx.session.get({ sessionID: toolCtx.sessionID }));
					} catch (error) {
						return { content: `ERROR: ${error instanceof Error ? error.message : String(error)}` };
					}
					const { text, isError } = await executeBatchQueue(
						params as BatchQueueToolParams,
						{ sessionId: toolCtx.sessionID, cwd },
						runners,
					);
					return { content: isError ? `ERROR: ${text}` : text };
				},
			});
		});

		const controller = new AbortController();
		void (async () => {
			try {
				for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
					if (event.type !== "session.deleted") continue;
					const data = "data" in event ? (event.data as { sessionID?: string } | undefined) : undefined;
					if (data?.sessionID) await runners.dispose(data.sessionID);
				}
			} catch {
				// Subscription ends when the plugin unloads.
			}
		})();

		return async () => {
			controller.abort();
			await runners.disposeAll();
		};
	},
});

export default BatchedQueuePlugin;
