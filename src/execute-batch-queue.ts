import type { QueueAction } from "./actions.js";
import { MAX_BATCH_ACTIONS } from "./constants.js";
import { formatBatchResult } from "./format-batch-result.js";
import { parseActionBatchPayload } from "./guards.js";
import { BatchQueueRunner } from "./queue-runner.js";
import type { BatchExecutionResult } from "./results.js";

export const BATCH_QUEUE_DESCRIPTION =
	`Run 1 to ${MAX_BATCH_ACTIONS} dependent repo actions back-to-back in one tool call, then read all results together. ` +
	"When you already know the next steps (for example edit → format → lint → test), send them as one batch instead of one tool call each. " +
	"Action types: read_lines, grep_pattern, execute_bash, apply_diff. " +
	"The shell keeps its cwd and env across steps and batches. The batch stops at the first failure; resend only the remaining steps. " +
	"Paths stay inside the workspace. For independent reads, use parallel native tool calls instead.\n\n" +
	"Example:\n" +
	'```json\n{"actions": [{"type":"apply_diff","path":"src/a.ts","oldText":"retries: 3","newText":"retries: 5"},{"type":"execute_bash","command":"npm run lint"},{"type":"execute_bash","command":"npm test -- a"}]}\n```';

export const BATCH_QUEUE_GUIDELINES = [
	"When you know two or more dependent next steps (edit, format, lint, test, inspect output), send them in one batch_queue call instead of separate tool calls.",
	"Use parallel native tool calls for independent reads or searches; use batch_queue for sequences where later steps depend on earlier ones.",
	"batch_queue stops at the first failing step. Fix the cause, then resend only the remaining steps.",
	"In execute_bash, append '|| true' when a non-zero exit code is expected, so the batch does not stop.",
	"Keep commands non-interactive and short-running.",
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
