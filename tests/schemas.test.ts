/** Schema and guard tests. */

import { describe, it, expect } from "bun:test";
import { Value } from "typebox/value";
import { MAX_BATCH_ACTIONS } from "../src/constants.js";
import {
	parseActionBatchPayload,
	isQueueAction,
	matchQueueAction,
	validateReadLinesRange,
} from "../src/guards.js";
import {
	createInitialBatchQueueSessionState,
	snapshotShellState,
} from "../src/state.js";
import { BatchQueueParamsSchema, QueueActionSchema } from "../src/schemas.js";

describe("ActionBatchPayload validation", () => {
	it("accepts a valid multi-action batch", () => {
		const payload = parseActionBatchPayload({
			batchId: "batch-1",
			actions: [
				{ type: "read_lines", path: "src/index.ts", startLine: 1, endLine: 50 },
				{ type: "grep_pattern", pattern: "export", glob: "*.ts" },
				{ type: "execute_bash", command: "npm test" },
				{
					type: "apply_diff",
					path: "src/index.ts",
					oldText: "foo",
					newText: "bar",
				},
			],
		});

		expect(payload.actions).toHaveLength(4);
		expect(payload.batchId).toBe("batch-1");
	});

	it("rejects empty action arrays", () => {
		expect(() =>
			parseActionBatchPayload({ actions: [] }),
		).toThrow(/Invalid batch/);
	});

	it("rejects batches over MAX_BATCH_ACTIONS", () => {
		const max = MAX_BATCH_ACTIONS;
		const actions = Array.from({ length: max + 1 }, () => ({
			type: "execute_bash" as const,
			command: "echo hi",
		}));

		expect(() => parseActionBatchPayload({ actions })).toThrow(
			/Invalid batch/,
		);
	});

	it("rejects unknown action discriminators", () => {
		expect(
			isQueueAction({ type: "delete_file", path: "x" }),
		).toBe(false);
	});

	it("rejects additional properties on actions", () => {
		expect(
			isQueueAction({
				type: "read_lines",
				path: "a.ts",
				extra: true,
			}),
		).toBe(false);
	});

	it("rejects bindTo, which is no longer supported", () => {
		expect(isQueueAction({ type: "read_lines", path: "a.ts", bindTo: "x" })).toBe(false);
	});
});

describe("discriminated union dispatch", () => {
	it("routes all action types exhaustively", () => {
		const actions = [
			{ type: "read_lines" as const, path: "a.ts" },
			{ type: "grep_pattern" as const, pattern: "foo" },
			{ type: "execute_bash" as const, command: "ls" },
			{
				type: "apply_diff" as const,
				path: "a.ts",
				oldText: "a",
				newText: "b",
			},
		];

		for (const action of actions) {
			const label = matchQueueAction(action, {
				read_lines: () => "read",
				grep_pattern: () => "grep",
				execute_bash: () => "bash",
				apply_diff: () => "diff",
			});
			expect(label).toBeTruthy();
		}
	});
});

describe("field validators", () => {
	it("flags invalid read line ranges", () => {
		expect(
			validateReadLinesRange({
				type: "read_lines",
				path: "a.ts",
				startLine: 10,
				endLine: 5,
			}),
		).toMatch(/endLine/);
	});
});

describe("state framework", () => {
	it("creates and snapshots shell session state", () => {
		const session = createInitialBatchQueueSessionState(
			"sess-1",
			"/workspace",
		);
		session.shell.cwd = "/workspace/src";
		session.shell.alive = true;
		session.shell.lastExitCode = 0;

		const snapshot = snapshotShellState(session.shell);
		expect(snapshot.cwd).toBe("/workspace/src");
		expect(snapshot.alive).toBe(true);
		expect(snapshot.lastExitCode).toBe(0);

		// snapshot is immutable copy
		session.shell.cwd = "/tmp";
		expect(snapshot.cwd).toBe("/workspace/src");
	});
});

describe("tool parameter schema", () => {
	it("matches the runtime guard", () => {
		const valid = { actions: [{ type: "execute_bash", command: "ls" }] };
		expect(Value.Check(BatchQueueParamsSchema, valid)).toBe(true);
		expect(Value.Check(BatchQueueParamsSchema, { actions: [] })).toBe(false);
		expect(Value.Check(BatchQueueParamsSchema, { ...valid, objective: "x" })).toBe(false);
		expect(Value.Check(QueueActionSchema, valid.actions[0])).toBe(true);
	});
});
