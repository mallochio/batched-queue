import { tool } from "@opencode-ai/plugin";
import type { ResolvedBatchQueueConfig } from "../config.js";

const bindToSchema = tool.schema
	.string()
	.regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
	.optional()
	.describe("Optional variable name for this action result; later string fields can reference it as ${name}.");

const readLinesActionSchema = tool.schema.object({
	type: tool.schema.literal("read_lines"),
	path: tool.schema.string().min(1),
	startLine: tool.schema.number().int().min(1).optional(),
	endLine: tool.schema.number().int().min(1).optional(),
	bindTo: bindToSchema,
});

const grepPatternActionSchema = tool.schema.object({
	type: tool.schema.literal("grep_pattern"),
	pattern: tool.schema.string().min(1),
	path: tool.schema.string().min(1).optional(),
	glob: tool.schema.string().min(1).optional(),
	caseSensitive: tool.schema.boolean().optional(),
	literal: tool.schema.boolean().optional(),
	contextLines: tool.schema.number().int().min(0).max(10).optional(),
	bindTo: bindToSchema,
});

const executeBashActionSchema = tool.schema.object({
	type: tool.schema.literal("execute_bash"),
	command: tool.schema.string().min(1),
	timeoutMs: tool.schema.number().int().min(1).optional(),
	bindTo: bindToSchema,
});

const applyDiffActionSchema = tool.schema.object({
	type: tool.schema.literal("apply_diff"),
	path: tool.schema.string().min(1),
	oldText: tool.schema.string(),
	newText: tool.schema.string(),
	replaceAll: tool.schema.boolean().optional(),
	bindTo: bindToSchema,
});

/** Driver-supplied explicit actions always allow all action types (matches Pi). */
const driverQueueActionSchema = tool.schema.discriminatedUnion("type", [
	readLinesActionSchema,
	grepPatternActionSchema,
	executeBashActionSchema,
	applyDiffActionSchema,
]);

export function createBatchQueueZodArgs(config: ResolvedBatchQueueConfig) {
	return {
		objective: tool.schema
			.string()
			.optional()
			.describe(
				"Describe a multi-step repo task (e.g. 'read config.ts, find where defaults load, run its test') and batch_queue plans and runs safe sequential read/grep/bash steps.",
			),
		actions: tool.schema
			.array(driverQueueActionSchema)
			.min(1)
			.max(config.maxBatchActions)
			.optional()
			.describe(
				"Pass the exact typed action sequence. Preferred for edits/apply_diff or when the steps are known. Each step can use a prior step's result via bindTo/${name}.",
			),
		batchId: tool.schema
			.string()
			.optional()
			.describe("Stable label for logging and debugging; not semantically important."),
	};
}
