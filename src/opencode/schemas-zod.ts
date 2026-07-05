import { tool } from "@opencode-ai/plugin";
import type { ResolvedBatchQueueConfig } from "../config.js";

const readLinesActionSchema = tool.schema.object({
	type: tool.schema.literal("read_lines"),
	path: tool.schema.string().min(1),
	startLine: tool.schema.number().int().min(1).optional(),
	endLine: tool.schema.number().int().min(1).optional(),
});

const grepPatternActionSchema = tool.schema.object({
	type: tool.schema.literal("grep_pattern"),
	pattern: tool.schema.string().min(1),
	path: tool.schema.string().min(1).optional(),
	glob: tool.schema.string().min(1).optional(),
	caseSensitive: tool.schema.boolean().optional(),
	literal: tool.schema.boolean().optional(),
	contextLines: tool.schema.number().int().min(0).max(10).optional(),
});

const executeBashActionSchema = tool.schema.object({
	type: tool.schema.literal("execute_bash"),
	command: tool.schema.string().min(1),
	timeoutMs: tool.schema.number().int().min(1).optional(),
});

const applyDiffActionSchema = tool.schema.object({
	type: tool.schema.literal("apply_diff"),
	path: tool.schema.string().min(1),
	oldText: tool.schema.string(),
	newText: tool.schema.string(),
	replaceAll: tool.schema.boolean().optional(),
});

function createQueueActionSchema(allowMutatingActions: boolean) {
	if (allowMutatingActions) {
		return tool.schema.discriminatedUnion("type", [
			readLinesActionSchema,
			grepPatternActionSchema,
			executeBashActionSchema,
			applyDiffActionSchema,
		]);
	}
	return tool.schema.discriminatedUnion("type", [
		readLinesActionSchema,
		grepPatternActionSchema,
		executeBashActionSchema,
	]);
}

export function createBatchQueueZodArgs(config: ResolvedBatchQueueConfig) {
	const queueActionSchema = createQueueActionSchema(config.allowObjectiveMutations);

	return {
		objective: tool.schema
			.string()
			.optional()
			.describe(
				"Use when the next few coding actions are obvious but tedious to enumerate; the executor plans up to N safe sequential actions.",
			),
		actions: tool.schema
			.array(queueActionSchema)
			.min(1)
			.max(config.maxBatchActions)
			.optional()
			.describe(
				"Pre-planned action batch from the driver model. Preferred when the exact deterministic reads, searches, checks, or edits are already known; skips executor analysis.",
			),
		batchId: tool.schema
			.string()
			.optional()
			.describe("Stable label for logging and debugging; not semantically important."),
	};
}
