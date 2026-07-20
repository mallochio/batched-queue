import {
	DEFAULT_COMMAND_TIMEOUT_MS,
	DEFAULT_OUTPUT_LIMITS,
	type OutputLimits,
} from "./constants";
export { BASH_TIMEOUT_EXIT_CODE } from "./constants.js";
import type { ActionBatchPayload } from "./payload";
import type {
	ActionExecutionResult,
	BatchExecutionResult,
	BatchHaltReason,
} from "./results";
import {
	createInitialBatchQueueSessionState,
	snapshotShellState,
	type BatchQueueSessionState,
} from "./state";
import { createPersistentShell, type PersistentShell } from "./persistent-shell";
import { executeQueueAction } from "./executors";
import { DEFAULT_FAILURE_HALT_REASON } from "./results";
import {
	BatchVariableResolutionError,
	bindActionResult,
	resolveActionBindings,
	type BatchVariableBindings,
} from "./bindings";
import { DEFAULT_PATH_SECURITY, findWorkspaceRoot, type PathSecurityConfig } from "./lib/path-security";

export interface BatchQueueRunnerOptions {
	readonly limits?: Partial<OutputLimits>;
	readonly defaultCommandTimeoutMs?: number;
	readonly env?: Record<string, string>;
	readonly pathSecurity?: PathSecurityConfig;
}

function mergeLimits(overrides?: Partial<OutputLimits>): OutputLimits {
	return { ...DEFAULT_OUTPUT_LIMITS, ...overrides };
}

function resolveHaltReason(result: ActionExecutionResult): BatchHaltReason {
	return result.haltReason ?? DEFAULT_FAILURE_HALT_REASON;
}

function shouldHaltBatch(result: ActionExecutionResult): boolean {
	return !result.success || result.exitCode !== 0;
}

function shouldResetShell(result: ActionExecutionResult): boolean {
	return result.haltReason === "timeout";
}

function resolveBatchErrorHaltReason(error: unknown): BatchHaltReason {
	return error instanceof BatchVariableResolutionError ? "validation_failed" : "shell_unavailable";
}

/**
 * Stateful batch queue runner with persistent bash and fast-fail semantics.
 */
export class BatchQueueRunner {
	private readonly limits: OutputLimits;
	private readonly defaultCommandTimeoutMs: number;
	private readonly env: Record<string, string>;
	private readonly pathSecurity: PathSecurityConfig;
	private gitWorkspaceRoot: string;
	private readonly session: BatchQueueSessionState;
	private shell: PersistentShell | null = null;
	private shellStale = false;

	constructor(
		sessionId: string,
		workspaceRoot: string,
		options: BatchQueueRunnerOptions = {},
	) {
		this.limits = mergeLimits(options.limits);
		this.defaultCommandTimeoutMs =
			options.defaultCommandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
		this.env = options.env ?? {};
		this.pathSecurity = options.pathSecurity ?? DEFAULT_PATH_SECURITY;
		this.gitWorkspaceRoot = findWorkspaceRoot(workspaceRoot);
		this.session = createInitialBatchQueueSessionState(
			sessionId,
			workspaceRoot,
			workspaceRoot,
		);
	}

	get state(): BatchQueueSessionState {
		return this.session;
	}

	/** Keeps path security and shell cwd aligned with the current Pi session cwd. */
	syncWorkspaceRoot(workspaceRoot: string): void {
		if (this.session.workspaceRoot === workspaceRoot) {
			return;
		}
		this.session.workspaceRoot = workspaceRoot;
		this.gitWorkspaceRoot = findWorkspaceRoot(workspaceRoot);
		this.session.updatedAtMs = Date.now();
		this.shellStale = true;
	}

	async ensureShell(): Promise<PersistentShell> {
		if (this.shellStale) {
			await this.resetShell();
			this.shellStale = false;
		}

		if (this.shell?.isAlive) {
			return this.shell;
		}

		if (this.shell) {
			await this.shell.dispose();
		}

		this.shell = createPersistentShell({
			initialCwd: this.session.workspaceRoot,
			env: this.env,
			defaultTimeoutMs: this.defaultCommandTimeoutMs,
		});

		await this.shell.waitUntilReady();
		this.session.shell.alive = true;
		this.session.updatedAtMs = Date.now();
		return this.shell;
	}

	private async resetShell(): Promise<void> {
		if (this.shell) {
			await this.shell.dispose();
			this.shell = null;
		}
		this.session.shell.alive = false;
		this.session.updatedAtMs = Date.now();
	}

	async executeBatch(payload: ActionBatchPayload): Promise<BatchExecutionResult> {
		const startedAtMs = Date.now();
		const totalRequested = payload.actions.length;
		const results: ActionExecutionResult[] = [];

		let haltedPrematurely = false;
		let haltReason: BatchHaltReason | undefined;
		let haltedAtIndex: number | undefined;
		let batchError: string | undefined;

		try {
			const shell = await this.ensureShell();
			const bindings: BatchVariableBindings = {};

			for (let index = 0; index < payload.actions.length; index++) {
				const action = payload.actions[index];
				const resolvedAction = resolveActionBindings(action, bindings);
				const result = await executeQueueAction(resolvedAction, index, {
					workspaceRoot: this.session.workspaceRoot,
					gitWorkspaceRoot: this.gitWorkspaceRoot,
					pathSecurity: this.pathSecurity,
					shell,
					shellState: this.session.shell,
					limits: this.limits,
					defaultTimeoutMs: this.defaultCommandTimeoutMs,
				});

				results.push(result);
				bindActionResult(resolvedAction, result, bindings);
				this.session.metrics.totalActionsExecuted += 1;
				this.session.updatedAtMs = Date.now();

				if (shouldHaltBatch(result)) {
					haltedPrematurely = true;
					haltReason = resolveHaltReason(result);
					haltedAtIndex = index;
					this.session.metrics.totalHalts += 1;

					if (shouldResetShell(result)) {
						await this.resetShell();
					}
					break;
				}
			}
		} catch (error) {
			haltedPrematurely = true;
			haltReason = resolveBatchErrorHaltReason(error);
			batchError = error instanceof Error ? error.message : String(error);
			haltedAtIndex = results.length;
			this.session.metrics.totalHalts += 1;
			await this.resetShell();
		}

		this.session.metrics.batchSequence += 1;
		this.session.metrics.totalBatchesExecuted += 1;
		this.session.updatedAtMs = Date.now();

		const completedAtMs = Date.now();

		return {
			batchId: payload.batchId,
			haltedPrematurely,
			haltReason,
			haltedAtIndex,
			completedCount: results.length,
			totalRequested,
			results,
			shellState: snapshotShellState(this.session.shell),
			startedAtMs,
			completedAtMs,
			durationMs: completedAtMs - startedAtMs,
			error: batchError,
		};
	}

	async dispose(): Promise<void> {
		await this.resetShell();
	}
}

export function createBatchQueueRunner(
	sessionId: string,
	workspaceRoot: string,
	options?: BatchQueueRunnerOptions,
): BatchQueueRunner {
	return new BatchQueueRunner(sessionId, workspaceRoot, options);
}
