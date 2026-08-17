import type { ResolvedBatchQueueConfig } from "./config.js";
import { configuredExecutionModelDescription } from "./planning-model.js";

export function buildBatchQueueDescription(
	config: ResolvedBatchQueueConfig,
	driverModelLine: string,
): string {
	const objectiveDesc = config.allowObjectiveMutations
		? "`objective`: describe the high-level goal; the execution planner grounds a multi-step plan (inspection, edits, and verification) in the workspace and runs it.\n"
		: "`objective`: describe the goal; the tool grounds a safe read/grep/bash plan in the workspace, then runs it (read/check-only by default).\n";

	return (
		`Use batch_queue to combine related repo work into one call when that avoids extra tool turns. It supports 2 to ${config.maxBatchActions} actions, and shell cwd/env persists between steps.\n\n` +
		"Example — describe the goal and let the execution planner structure the steps:\n" +
		'```json\n{"objective": "Read src/config.ts, find where defaults load, and run its focused test."}\n```\n\n' +
		"Example — pass the exact steps:\n" +
		'```json\n{"actions": [{"type":"read_lines","path":"src/config.ts","startLine":1,"endLine":80},{"type":"execute_bash","command":"npm test -- config"}]}\n```\n\n' +
		objectiveDesc +
		"`actions`: pass the exact typed steps — preferred when the exact sequence is known, for precise edits, or after a failed batch.\n\n" +
		"Action types: read_lines, grep_pattern, execute_bash, apply_diff. Optional `bindTo` names a result; reference it later as `${name}` (raw text, not shell-escaped). Fast-fail on first error. Workspace-scoped.\n" +
		"Native tools remain available when they are simpler or when work should run in parallel.\n" +
		`Planner / driver model: ${driverModelLine}\n` +
		`Execution model (objective batches only): ${configuredExecutionModelDescription(config)}`
	);
}
