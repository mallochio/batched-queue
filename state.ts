/**
 * Snapshot of the persistent interactive shell at a point in time.
 * Used by the queue runner to preserve cwd between batched actions.
 */
export interface ShellSessionStateSnapshot {
	readonly sessionId: string;
	readonly cwd: string;
	readonly alive: boolean;
	readonly lastExitCode: number | null;
}

/** Mutable runtime state owned by the queue runner (Milestone 2). */
export interface ShellSessionState extends ShellSessionStateSnapshot {
	cwd: string;
	alive: boolean;
	lastExitCode: number | null;
}

/** Aggregate counters tracked across batches within a Pi session. */
export interface QueueRunnerMetrics {
	batchSequence: number;
	totalActionsExecuted: number;
	totalBatchesExecuted: number;
	totalHalts: number;
}

/** Full session-scoped framework state for the batched queue extension. */
export interface BatchQueueSessionState {
	readonly sessionId: string;
	workspaceRoot: string;
	shell: ShellSessionState;
	metrics: QueueRunnerMetrics;
	readonly createdAtMs: number;
	updatedAtMs: number;
}

export function createInitialShellSessionState(
	sessionId: string,
	cwd: string,
): ShellSessionState {
	return {
		sessionId,
		cwd,
		alive: false,
		lastExitCode: null,
	};
}

export function createInitialBatchQueueSessionState(
	sessionId: string,
	workspaceRoot: string,
	cwd: string = workspaceRoot,
): BatchQueueSessionState {
	const now = Date.now();
	return {
		sessionId,
		workspaceRoot,
		shell: createInitialShellSessionState(sessionId, cwd),
		metrics: {
			batchSequence: 0,
			totalActionsExecuted: 0,
			totalBatchesExecuted: 0,
			totalHalts: 0,
		},
		createdAtMs: now,
		updatedAtMs: now,
	};
}

export function snapshotShellState(
	shell: ShellSessionState,
): ShellSessionStateSnapshot {
	return {
		sessionId: shell.sessionId,
		cwd: shell.cwd,
		alive: shell.alive,
		lastExitCode: shell.lastExitCode,
	};
}
