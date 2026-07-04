export {
	MAX_BATCH_ACTIONS,
	DEFAULT_MAX_BATCH_ACTIONS,
	MIN_BATCH_ACTIONS,
	ACTION_TYPES,
	DEFAULT_OUTPUT_LIMITS,
	DEFAULT_COMMAND_TIMEOUT_MS,
	SHELL_SENTINEL_PREFIX,
	SHELL_STDOUT_END_MARKER,
	SHELL_STDERR_END_MARKER,
	SHELL_META_PREFIX,
	type ActionType,
	type OutputLimits,
} from "./constants";

export type {
	LineRange,
	ReadLinesAction,
	GrepPatternAction,
	ExecuteBashAction,
	ApplyDiffAction,
	QueueAction,
	QueueActionMap,
	QueueActionOf,
	ActionBatchActions,
	ActionBatchTuple,
} from "./actions";

export type {
	ActionBatchPayload,
	UnvalidatedActionBatchPayload,
} from "./payload";

export type {
	TruncationBoundary,
	TruncationUnit,
	TruncationInfo,
	TruncatedSegments,
	CapturedStream,
} from "./truncation";

export type {
	BatchHaltReason,
	ActionResultBase,
	ReadLineEntry,
	ReadLinesActionResult,
	GrepMatchEntry,
	GrepPatternActionResult,
	ExecuteBashActionResult,
	DiffMatchStrategy,
	ApplyDiffActionResult,
	ActionExecutionResult,
	ActionExecutionResultMap,
	ActionExecutionResultOf,
	BatchExecutionResult,
	ActionResultPair,
} from "./results";

export type {
	ShellSessionStateSnapshot,
	ShellSessionState,
	QueueRunnerMetrics,
	BatchQueueSessionState,
} from "./state";

export type {
	BatchQueueConfig,
	ResolvedBatchQueueConfig,
	ModelRef,
} from "./config";

export {
	resolveBatchQueueConfig,
	parseModelRefString,
} from "./config";

export {
	createInitialShellSessionState,
	createInitialBatchQueueSessionState,
	snapshotShellState,
} from "./state";

export {
	QueueActionSchema,
	ActionBatchPayloadSchema,
	createActionBatchPayloadSchema,
	BatchExecutionResultSchema,
	createBatchExecutionResultSchema,
	createSubmitActionBatchToolSchema,
	ReadLinesActionSchema,
	GrepPatternActionSchema,
	ExecuteBashActionSchema,
	ApplyDiffActionSchema,
	ActionTypeSchema,
	/** @deprecated Use QueueAction from ./actions instead. */
	type QueueActionFromSchema,
	type QueueActionSchemaType,
	type ActionBatchPayloadSchemaType,
	type BatchExecutionResultSchemaType,
} from "./schemas";

export {
	isActionType,
	isQueueAction,
	assertQueueAction,
	isActionBatchPayload,
	parseActionBatchPayload,
	parseActionBatchPayloadWithConfig,
	getActionType,
	matchQueueAction,
	matchActionExecutionResult,
	validateBatchActionCount,
	validateReadLinesRange,
} from "./guards";

export {
	captureStdout,
	captureStderr,
	captureStreamText,
	resolveAndValidatePath,
	truncateLines,
	truncateLineText,
} from "./capture";

export {
	PersistentShell,
	createPersistentShell,
	type PersistentShellOptions,
	type ShellCommandResult,
} from "./persistent-shell";

export {
	BatchQueueRunner,
	createBatchQueueRunner,
	type BatchQueueRunnerOptions,
} from "./queue-runner";

export { executeQueueAction, type ExecutorContext } from "./executors";

export {
	validateAndPrepareDiff,
	applyDiffToContent,
	locateDiffBlock,
	normalizeForDiffMatch,
	routeSyntaxLanguage,
	validateSyntax,
} from "./diff-validation";

export {
	analyzeBatchObjective,
	createBatchQueueToolParameters,
	type BatchAnalyzerContext,
} from "./analyzer";

export { registerBatchedQueueExtension } from "./extension";
export { default } from "./extension";
