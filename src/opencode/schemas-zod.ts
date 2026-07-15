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
				"Default for 2+ dependent repo steps. Describe the multi-step task; batch_queue plans and runs a safe sequential read/check action batch. Do not use for one obvious command.",
			),
		actions: tool.schema
			.array(driverQueueActionSchema)
			.min(1)
			.max(config.maxBatchActions)
			.optional()
			.describe(
				"Advanced escape hatch. Use only for 2+ exact ordered actions, mutation/apply_diff, or continuing after a failed batch; skips objective planning. Do not wrap one obvious command.",
			),
		batchId: tool.schema
			.string()
			.optional()
			.describe("Stable label for logging and debugging; not semantically important."),
	};
}
