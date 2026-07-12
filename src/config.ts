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

export type ExecutorThinkingLevel = "minimal" | "low" | "medium" | "high" | "xhigh";

/**
 * User-facing configuration for the batched queue extension.
 * Passed to the Pi extension factory, loaded from JSON files, and/or env vars.
 */
export interface BatchQueueConfig {
	/**
	 * Maximum actions permitted in a single batch turn.
	 * Default: 10. Increase to allow larger batched tool calls.
	 */
	maxBatchActions?: number;
	/**
	 * Optional cheap model for converting an `objective` into action batches.
	 * When unset, the session driver / planner model is used.
	 * JSON alias: `executionModel`.
	 */
	executorModel?: ModelRef;
	/**
	 * Optional cheap model for converting an `objective` into action batches.
	 * When unset, the session driver / planner model is used.
	 */
	executionModel?: ModelRef;
	/**
	 * Optional reasoning/thinking effort for objective→actions conversion.
	 * Applied best-effort: Pi forwards it as provider reasoningEffort; OpenCode
	 * forwards it as the prompt variant.
	 */
	executorThinking?: ExecutorThinkingLevel;
	/**
	 * How many read/grep grounding turns the planner may take before it must
	 * submit a batch. 0 = plan blind in one shot (old behavior). Default: 3.
	 */
	groundingTurns?: number;
	/**
	 * Whether objective-planned batches may include mutating actions such as
	 * apply_diff. Direct `actions` batches are always allowed to include them.
	 * Default: false.
	 */
	allowObjectiveMutations?: boolean;
	/** Path security overrides (merged with DEFAULT_PATH_SECURITY). */
	pathSecurity?: Partial<PathSecurityConfig>;
}

export interface ResolvedBatchQueueConfig {
	readonly maxBatchActions: number;
	/**
	 * Optional cheap model for objective→actions conversion.
	 * When unset, the session driver / planner model is used.
	 */
	readonly executorModel?: ModelRef;
	readonly executorThinking?: ExecutorThinkingLevel;
	readonly groundingTurns: number;
	readonly allowObjectiveMutations: boolean;
	readonly pathSecurity: PathSecurityConfig;
}

const ENV_MAX_ACTIONS = "BATCH_QUEUE_MAX_ACTIONS";
const ENV_EXECUTOR = "BATCH_QUEUE_EXECUTOR";
const ENV_EXECUTOR_PROVIDER = "BATCH_QUEUE_EXECUTOR_PROVIDER";
const ENV_EXECUTOR_MODEL = "BATCH_QUEUE_EXECUTOR_MODEL";
const ENV_EXECUTOR_THINKING = "BATCH_QUEUE_EXECUTOR_THINKING";
const ENV_GROUNDING_TURNS = "BATCH_QUEUE_GROUNDING_TURNS";
const DEFAULT_GROUNDING_TURNS = 3;
const ENV_ALLOW_OBJECTIVE_MUTATIONS = "BATCH_QUEUE_ALLOW_OBJECTIVE_MUTATIONS";

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

function parseNonNegativeInt(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 0) return undefined;
	return parsed;
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
	if (!value) return undefined;
	const normalized = value.trim().toLowerCase();
	if (["1", "true", "yes", "on"].includes(normalized)) return true;
	if (["0", "false", "no", "off"].includes(normalized)) return false;
	return undefined;
}

export function parseExecutorThinking(value: unknown): ExecutorThinkingLevel | undefined {
	if (typeof value !== "string") return undefined;
	const normalized = value.trim().toLowerCase();
	return ["minimal", "low", "medium", "high", "xhigh"].includes(normalized)
		? normalized as ExecutorThinkingLevel
		: undefined;
}

export function resolveBatchQueueConfig(
	overrides: BatchQueueConfig = {},
	fileConfig: BatchQueueConfig = {},
): ResolvedBatchQueueConfig {
	const maxBatchActions =
		overrides.maxBatchActions ??
		parsePositiveInt(process.env[ENV_MAX_ACTIONS]) ??
		fileConfig.maxBatchActions ??
		DEFAULT_MAX_BATCH_ACTIONS;

	const executorModel =
		overrides.executionModel ??
		overrides.executorModel ??
		parseExecutorFromEnv() ??
		fileConfig.executionModel ??
		fileConfig.executorModel;

	const executorThinking =
		overrides.executorThinking ??
		parseExecutorThinking(process.env[ENV_EXECUTOR_THINKING]) ??
		fileConfig.executorThinking;

	const groundingTurns =
		overrides.groundingTurns ??
		parseNonNegativeInt(process.env[ENV_GROUNDING_TURNS]) ??
		fileConfig.groundingTurns ??
		DEFAULT_GROUNDING_TURNS;

	return {
		maxBatchActions,
		groundingTurns: Math.max(0, groundingTurns),
		...(executorModel ? { executorModel } : {}),
		...(executorThinking ? { executorThinking } : {}),
		allowObjectiveMutations:
			overrides.allowObjectiveMutations ??
			parseBooleanEnv(process.env[ENV_ALLOW_OBJECTIVE_MUTATIONS]) ??
			fileConfig.allowObjectiveMutations ??
			false,
		pathSecurity: {
			...DEFAULT_PATH_SECURITY,
			...fileConfig.pathSecurity,
			...overrides.pathSecurity,
		},
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
