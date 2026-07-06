import { Type, type Static } from "@sinclair/typebox";
import {
	ACTION_TYPES,
	DEFAULT_MAX_BATCH_ACTIONS,
	MIN_BATCH_ACTIONS,
} from "./constants.js";

const ReadLinesActionSchema = Type.Object(
	{
		type: Type.Literal("read_lines"),
		path: Type.String({ minLength: 1 }),
		startLine: Type.Optional(Type.Integer({ minimum: 1 })),
		endLine: Type.Optional(Type.Integer({ minimum: 1 })),
	},
	{ additionalProperties: false },
);

const GrepPatternActionSchema = Type.Object(
	{
		type: Type.Literal("grep_pattern"),
		pattern: Type.String({ minLength: 1 }),
		path: Type.Optional(Type.String({ minLength: 1 })),
		glob: Type.Optional(Type.String({ minLength: 1 })),
		caseSensitive: Type.Optional(Type.Boolean()),
		literal: Type.Optional(Type.Boolean()),
		contextLines: Type.Optional(Type.Integer({ minimum: 0, maximum: 10 })),
	},
	{ additionalProperties: false },
);

const ExecuteBashActionSchema = Type.Object(
	{
		type: Type.Literal("execute_bash"),
		command: Type.String({ minLength: 1 }),
		timeoutMs: Type.Optional(Type.Integer({ minimum: 1 })),
	},
	{ additionalProperties: false },
);

const ApplyDiffActionSchema = Type.Object(
	{
		type: Type.Literal("apply_diff"),
		path: Type.String({ minLength: 1 }),
		oldText: Type.String(),
		newText: Type.String(),
		replaceAll: Type.Optional(Type.Boolean()),
	},
	{ additionalProperties: false },
);

export const QueueActionSchema = Type.Union([
	ReadLinesActionSchema,
	GrepPatternActionSchema,
	ExecuteBashActionSchema,
	ApplyDiffActionSchema,
]);

const ObjectiveQueueActionSchema = Type.Union([
	ReadLinesActionSchema,
	GrepPatternActionSchema,
	ExecuteBashActionSchema,
]);

export type QueueActionFromSchema = Static<typeof QueueActionSchema>;
/** @deprecated Alias for QueueActionFromSchema. */
export type QueueActionSchemaType = QueueActionFromSchema;

export function createActionBatchPayloadSchema(maxBatchActions: number = DEFAULT_MAX_BATCH_ACTIONS) {
	return Type.Object(
		{
			actions: Type.Array(QueueActionSchema, {
				minItems: MIN_BATCH_ACTIONS,
				maxItems: maxBatchActions,
			}),
			batchId: Type.Optional(Type.String({ minLength: 1 })),
			rationale: Type.Optional(Type.String()),
		},
		{ additionalProperties: false },
	);
}

/** Default schema using DEFAULT_MAX_BATCH_ACTIONS (10). */
export const ActionBatchPayloadSchema = createActionBatchPayloadSchema();

export type ActionBatchPayloadSchemaType = Static<typeof ActionBatchPayloadSchema>;

export function createBatchExecutionResultSchema(maxBatchActions: number = DEFAULT_MAX_BATCH_ACTIONS) {
	const TruncationInfoSchema = Type.Object(
		{
			truncated: Type.Boolean(),
			unit: Type.Union([Type.Literal("lines"), Type.Literal("chars")]),
			totalUnits: Type.Integer({ minimum: 0 }),
			headUnits: Type.Integer({ minimum: 0 }),
			tailUnits: Type.Integer({ minimum: 0 }),
			omittedUnits: Type.Integer({ minimum: 0 }),
		},
		{ additionalProperties: false },
	);

	const CapturedStreamSchema = Type.Object(
		{
			text: Type.String(),
			truncation: Type.Optional(TruncationInfoSchema),
		},
		{ additionalProperties: false },
	);

	const BatchHaltReasonSchema = Type.Union([
		Type.Literal("non_zero_exit"),
		Type.Literal("validation_failed"),
		Type.Literal("action_error"),
		Type.Literal("permission_denied"),
		Type.Literal("timeout"),
		Type.Literal("shell_unavailable"),
	]);

	const ActionResultBaseSchema = {
		index: Type.Integer({ minimum: 0 }),
		success: Type.Boolean(),
		exitCode: Type.Integer(),
		durationMs: Type.Integer({ minimum: 0 }),
		error: Type.Optional(Type.String()),
		haltReason: Type.Optional(BatchHaltReasonSchema),
	};

	const ReadLinesActionResultSchema = Type.Object(
		{
			...ActionResultBaseSchema,
			type: Type.Literal("read_lines"),
			path: Type.String(),
			lines: Type.Array(
				Type.Object({
					lineNumber: Type.Integer({ minimum: 1 }),
					text: Type.String(),
				}),
			),
			formatted: Type.String(),
			totalLinesInFile: Type.Integer({ minimum: 0 }),
			requestedRange: Type.Optional(
				Type.Object({
					startLine: Type.Integer({ minimum: 1 }),
					endLine: Type.Integer({ minimum: 1 }),
				}),
			),
			truncation: Type.Optional(TruncationInfoSchema),
		},
		{ additionalProperties: false },
	);

	const GrepPatternActionResultSchema = Type.Object(
		{
			...ActionResultBaseSchema,
			type: Type.Literal("grep_pattern"),
			pattern: Type.String(),
			matches: Type.Array(
				Type.Object({
					path: Type.String(),
					lineNumber: Type.Integer({ minimum: 1 }),
					text: Type.String(),
					isContext: Type.Boolean(),
				}),
			),
			matchCount: Type.Integer({ minimum: 0 }),
			truncated: Type.Boolean(),
			truncation: Type.Optional(TruncationInfoSchema),
		},
		{ additionalProperties: false },
	);

	const ExecuteBashActionResultSchema = Type.Object(
		{
			...ActionResultBaseSchema,
			type: Type.Literal("execute_bash"),
			command: Type.String(),
			stdout: CapturedStreamSchema,
			stderr: CapturedStreamSchema,
		},
		{ additionalProperties: false },
	);

	const ApplyDiffActionResultSchema = Type.Object(
		{
			...ActionResultBaseSchema,
			type: Type.Literal("apply_diff"),
			path: Type.String(),
			applied: Type.Boolean(),
			matchStrategy: Type.Optional(
				Type.Union([
					Type.Literal("exact"),
					Type.Literal("normalized"),
					Type.Literal("sliding_window"),
				]),
			),
			bytesBefore: Type.Integer({ minimum: 0 }),
			bytesAfter: Type.Integer({ minimum: 0 }),
			validationErrors: Type.Optional(Type.Array(Type.String())),
		},
		{ additionalProperties: false },
	);

	const ActionExecutionResultSchema = Type.Union([
		ReadLinesActionResultSchema,
		GrepPatternActionResultSchema,
		ExecuteBashActionResultSchema,
		ApplyDiffActionResultSchema,
	]);

	const ShellSessionStateSnapshotSchema = Type.Object(
		{
			sessionId: Type.String(),
			cwd: Type.String(),
			alive: Type.Boolean(),
			lastExitCode: Type.Union([Type.Integer(), Type.Null()]),
		},
		{ additionalProperties: false },
	);

	return Type.Object(
		{
			batchId: Type.Optional(Type.String()),
			haltedPrematurely: Type.Boolean(),
			haltReason: Type.Optional(BatchHaltReasonSchema),
			haltedAtIndex: Type.Optional(Type.Integer({ minimum: 0 })),
			completedCount: Type.Integer({ minimum: 0 }),
			totalRequested: Type.Integer({ minimum: 1, maximum: maxBatchActions }),
			results: Type.Array(ActionExecutionResultSchema),
			shellState: ShellSessionStateSnapshotSchema,
			startedAtMs: Type.Integer({ minimum: 0 }),
			completedAtMs: Type.Integer({ minimum: 0 }),
			durationMs: Type.Integer({ minimum: 0 }),
			error: Type.Optional(Type.String()),
		},
		{ additionalProperties: false },
	);
}

export const BatchExecutionResultSchema = createBatchExecutionResultSchema();

export type BatchExecutionResultSchemaType = Static<typeof BatchExecutionResultSchema>;

/** Runtime list of valid action discriminators (mirrors ACTION_TYPES). */
export const ActionTypeSchema = Type.Union(
	ACTION_TYPES.map((type) => Type.Literal(type)),
);

export function createSubmitActionBatchToolSchema(
	maxBatchActions: number,
	options: { allowMutatingActions?: boolean } = {},
) {
	return Type.Object({
		actions: Type.Array(options.allowMutatingActions ? QueueActionSchema : ObjectiveQueueActionSchema, {
			minItems: MIN_BATCH_ACTIONS,
			maxItems: maxBatchActions,
		}),
		rationale: Type.Optional(Type.String()),
	});
}

export {
	ReadLinesActionSchema,
	GrepPatternActionSchema,
	ExecuteBashActionSchema,
	ApplyDiffActionSchema,
};
