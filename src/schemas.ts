import { Type } from "typebox";
import { MAX_BATCH_ACTIONS, MIN_BATCH_ACTIONS } from "./constants.js";

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

/** batch_queue tool parameters. */
export const BatchQueueParamsSchema = Type.Object(
	{
		actions: Type.Array(QueueActionSchema, {
			minItems: MIN_BATCH_ACTIONS,
			maxItems: MAX_BATCH_ACTIONS,
			description: "Typed actions to run in order. The batch stops at the first failure.",
		}),
		batchId: Type.Optional(Type.String({ description: "Optional label for logs." })),
	},
	{ additionalProperties: false },
);

export {
	ReadLinesActionSchema,
	GrepPatternActionSchema,
	ExecuteBashActionSchema,
	ApplyDiffActionSchema,
};
