/** Default maximum actions per batch when no config override is provided. */
export const DEFAULT_MAX_BATCH_ACTIONS = 10 as const;

/** @deprecated Use DEFAULT_MAX_BATCH_ACTIONS or ResolvedBatchQueueConfig.maxBatchActions */
export const MAX_BATCH_ACTIONS = DEFAULT_MAX_BATCH_ACTIONS;

/** Minimum number of actions required in a batch payload. */
export const MIN_BATCH_ACTIONS = 1 as const;

/** Supported action discriminator values for the batched queue. */
export const ACTION_TYPES = [
	"read_lines",
	"grep_pattern",
	"execute_bash",
	"apply_diff",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

/** Default output limits applied by the queue runner (Milestone 2). */
export const DEFAULT_OUTPUT_LIMITS = {
	maxStdoutLines: 200,
	maxStderrLines: 100,
	maxStdoutChars: 64_000,
	maxStderrChars: 16_000,
	maxReadLines: 500,
	maxGrepMatches: 100,
	maxLineChars: 500,
} as const;

export type OutputLimits = typeof DEFAULT_OUTPUT_LIMITS;

/** Sentinel token emitted by the persistent shell runner between commands. */
export const SHELL_SENTINEL_PREFIX = "__BATCH_QUEUE_SENTINEL__" as const;

export const SHELL_STDOUT_END_MARKER = `${SHELL_SENTINEL_PREFIX}:STDOUT_END` as const;
export const SHELL_STDERR_END_MARKER = `${SHELL_SENTINEL_PREFIX}:STDERR_END` as const;
export const SHELL_META_PREFIX = `${SHELL_SENTINEL_PREFIX}:META:` as const;

/** Default per-command timeout when an action does not specify one. */
export const DEFAULT_COMMAND_TIMEOUT_MS = 120_000 as const;

/** Exit code used when a persistent-shell command times out. */
export const BASH_TIMEOUT_EXIT_CODE = 124 as const;
