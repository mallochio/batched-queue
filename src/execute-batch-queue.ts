import type { QueueAction } from "./actions.js";
import { MAX_BATCH_ACTIONS } from "./constants.js";
import { formatBatchResult } from "./format-batch-result.js";
import { parseActionBatchPayload } from "./guards.js";
import { BatchQueueRunner } from "./queue-runner.js";
import type { BatchExecutionResult } from "./results.js";

export const BATCH_QUEUE_DESCRIPTION =
	`Run 1 to ${MAX_BATCH_ACTIONS} typed repo actions in order in one tool call. ` +
	"Action types: read_lines, grep_pattern, execute_bash, apply_diff. " +
	"The shell cwd and env persist between steps and batches. The batch stops at the first failure. Paths stay inside the workspace.\n\n" +
	"Example:\n" +
	'```json\n{"actions": [{"type":"read_lines","path":"src/config.ts","startLine":1,"endLine":80},{"type":"execute_bash","command":"npm test -- config"}]}\n```';

export const BATCH_QUEUE_GUIDELINES = [
	"Use batch_queue when related repo steps (read, grep, edit, verify) can run in one call.",
	"In execute_bash, append '|| true' when a non-zero exit code is expected, so the batch does not stop.",
	"Keep commands non-interactive.",
] as const;

export interface BatchQueueToolParams {
	readonly actions: readonly QueueAction[];
	readonly batchId?: string;
}

export interface BatchQueueExecuteResult {
	readonly text: string;
	readonly isError: boolean;
	readonly result?: BatchExecutionResult;
}

/** Owns one persistent-shell runner per session. */
export class BatchQueueRunners {
	private readonly runners = new Map<string, BatchQueueRunner>();

	get(sessionId: string, cwd: string): BatchQueueRunner {
		let runner = this.runners.get(sessionId);
		if (!runner) {
			runner = new BatchQueueRunner(sessionId, cwd);
			this.runners.set(sessionId, runner);
		} else {
			runner.syncWorkspaceRoot(cwd);
		}
		return runner;
	}

	async dispose(sessionId: string): Promise<void> {
		await this.runners.get(sessionId)?.dispose();
		this.runners.delete(sessionId);
	}

	async disposeAll(): Promise<void> {
		for (const sessionId of [...this.runners.keys()]) {
			await this.dispose(sessionId);
		}
	}
}

export async function executeBatchQueue(
	params: BatchQueueToolParams,
	session: { readonly sessionId: string; readonly cwd: string },
	runners: BatchQueueRunners,
): Promise<BatchQueueExecuteResult> {
	let payload;
	try {
		payload = parseActionBatchPayload(params);
	} catch (error) {
		return { text: error instanceof Error ? error.message : String(error), isError: true };
	}
	const result = await runners.get(session.sessionId, session.cwd).executeBatch(payload);
	return { text: formatBatchResult(result), isError: result.haltedPrematurely, result };
}
