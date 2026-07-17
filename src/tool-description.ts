import type { ResolvedBatchQueueConfig } from "./config.js";
import { configuredExecutionModelDescription } from "./planning-model.js";

export function buildBatchQueueDescription(
	config: ResolvedBatchQueueConfig,
	driverModelLine: string,
): string {
	return (
		`Run up to ${config.maxBatchActions} dependent repo actions in one call instead of making 2+ separate read/grep/bash calls. Shell cwd/env persists between steps.\n\n` +
		"Example — describe the goal and let the tool plan the steps:\n" +
		'```json\n{"objective": "Read src/config.ts, find where defaults load, and run its focused test."}\n```\n\n' +
		"Example — pass the exact steps (preferred for edits):\n" +
		'```json\n{"actions": [{"type":"read_lines","path":"src/config.ts","startLine":1,"endLine":80},{"type":"execute_bash","command":"npm test -- config"}]}\n```\n\n' +
		"`objective`: describe the goal; the tool grounds a safe read/grep/bash plan in the workspace, then runs it (read/check-only by default).\n" +
		"`actions`: pass the exact typed steps — preferred when the sequence is known, for `apply_diff`, or after a failed batch.\n\n" +
		"Action types: read_lines, grep_pattern, execute_bash, apply_diff. Optional `bindTo` names a result; reference it later as `${name}` (raw text, not shell-escaped). Fast-fail on first error. Workspace-scoped.\n" +
		"For one obvious command or independent parallel actions, use native tools directly.\n" +
		`Planner / driver model: ${driverModelLine}\n` +
		`Execution model (objective batches only): ${configuredExecutionModelDescription(config)}`
	);
}
