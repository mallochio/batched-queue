/**
 * Prime Agent extension: registers the `batch_queue` tool.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	BATCH_QUEUE_DESCRIPTION,
	BATCH_QUEUE_GUIDELINES,
	BatchQueueRunners,
	executeBatchQueue,
} from "./execute-batch-queue";
import { BatchQueueParamsSchema } from "./schemas";

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
