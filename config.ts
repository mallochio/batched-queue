import {
	DEFAULT_MAX_BATCH_ACTIONS,
	MIN_BATCH_ACTIONS,
} from "./constants.js";
import {
	DEFAULT_PATH_SECURITY,
	type PathSecurityConfig,
} from "./lib/path-security";

/** Provider + model id pair used to resolve models via Pi's model registry. */
export interface ModelRef {
	readonly provider: string;
	readonly id: string;
}

/**
 * User-facing configuration for the batched queue extension.
 * Passed to the Pi extension factory and/or loaded from environment variables.
 */
export interface BatchQueueConfig {
	/**
	 * Maximum actions permitted in a single batch turn.
	 * Default: 5. Increase to allow larger batched tool calls (e.g. 10, 15).
	 */
	maxBatchActions?: number;
	/**
	 * Fast/cheap model that generates the structured action batch JSON.
	 * The driver model is always the main model selected in Pi (ctx.model).
	 */
	executorModel?: ModelRef;
	/** Path security overrides (merged with DEFAULT_PATH_SECURITY). */
	pathSecurity?: Partial<PathSecurityConfig>;
}

export interface ResolvedBatchQueueConfig {
	readonly maxBatchActions: number;
	/**
	 * Optional fast/cheap model for objective planning.
	 * When unset, the Pi session driver model (ctx.model) is used.
	 */
	readonly executorModel?: ModelRef;
	readonly pathSecurity: PathSecurityConfig;
}

/** @deprecated Executor defaults to the Pi session driver model when unset. */
export const DEFAULT_EXECUTOR_MODEL: ModelRef = {
	provider: "openrouter",
	id: "deepseek/deepseek-chat-v3-0324",
};

const ENV_MAX_ACTIONS = "BATCH_QUEUE_MAX_ACTIONS";
const ENV_EXECUTOR = "BATCH_QUEUE_EXECUTOR";
const ENV_EXECUTOR_PROVIDER = "BATCH_QUEUE_EXECUTOR_PROVIDER";
const ENV_EXECUTOR_MODEL = "BATCH_QUEUE_EXECUTOR_MODEL";

function parsePositiveInt(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < MIN_BATCH_ACTIONS) return undefined;
	return parsed;
}

function parseExecutorFromEnv(): ModelRef | undefined {
	const combined = process.env[ENV_EXECUTOR]?.trim();
	if (combined) {
		const slash = combined.indexOf("/");
		if (slash === -1) {
			return { provider: "openrouter", id: combined };
		}
		return {
			provider: combined.slice(0, slash),
			id: combined.slice(slash + 1),
		};
	}

	const provider = process.env[ENV_EXECUTOR_PROVIDER]?.trim();
	const id = process.env[ENV_EXECUTOR_MODEL]?.trim();
	if (provider && id) {
		return { provider, id };
	}
	return undefined;
}

export function resolveBatchQueueConfig(
	overrides: BatchQueueConfig = {},
): ResolvedBatchQueueConfig {
	const maxBatchActions =
		overrides.maxBatchActions ??
		parsePositiveInt(process.env[ENV_MAX_ACTIONS]) ??
		DEFAULT_MAX_BATCH_ACTIONS;

	const executorModel =
		overrides.executorModel ??
		parseExecutorFromEnv();

	return {
		maxBatchActions,
		...(executorModel ? { executorModel } : {}),
		pathSecurity: { ...DEFAULT_PATH_SECURITY, ...overrides.pathSecurity },
	};
}

export function parseModelRefString(value: string): ModelRef {
	const trimmed = value.trim();
	const slash = trimmed.indexOf("/");
	if (slash === -1) {
		return { provider: "openrouter", id: trimmed };
	}
	return {
		provider: trimmed.slice(0, slash),
		id: trimmed.slice(slash + 1),
	};
}
