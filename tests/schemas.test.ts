/**
 * schema and guard tests for the batched queue Milestone 1 types.
 *
 * run: bun test pi-config/extensions/batched-queue/schemas.test.ts
 */

import { describe, it, expect } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { DEFAULT_MAX_BATCH_ACTIONS } from "../src/constants.js";
import {
	parseActionBatchPayload,
	isQueueAction,
	matchQueueAction,
	validateReadLinesRange,
	validateBatchActionCount,
} from "../src/guards.js";
import {
	createInitialBatchQueueSessionState,
	snapshotShellState,
} from "../src/state.js";
import {
	createActionBatchPayloadSchema,
	createBatchExecutionResultSchema,
	createSubmitActionBatchToolSchema,
	QueueActionSchema,
} from "../src/schemas.js";

describe("ActionBatchPayload validation", () => {
	it("accepts a valid multi-action batch", () => {
		const payload = parseActionBatchPayload({
			batchId: "batch-1",
			reflection: {
				confidence: 4,
				successCriteria: "all actions complete",
				risks: ["none"],
			},
			actions: [
				{ type: "read_lines", path: "src/index.ts", startLine: 1, endLine: 50, bindTo: "indexSnippet" },
				{ type: "grep_pattern", pattern: "export", glob: "*.ts", bindTo: "exports" },
				{ type: "execute_bash", command: "npm test", bindTo: "testOutput" },
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
		expect(payload.reflection?.confidence).toBe(4);
	});

	it("rejects empty action arrays", () => {
		expect(() =>
			parseActionBatchPayload({ actions: [] }),
		).toThrow(/Invalid action batch payload/);
	});

	it("rejects batches exceeding configured maxBatchActions", () => {
		const max = DEFAULT_MAX_BATCH_ACTIONS;
		const actions = Array.from({ length: max + 1 }, () => ({
			type: "execute_bash" as const,
			command: "echo hi",
		}));

		expect(() => parseActionBatchPayload({ actions })).toThrow(
			/Invalid action batch payload/,
		);
	});

	it("accepts batches up to a raised ceiling", () => {
		const payload = parseActionBatchPayload(
			{
				actions: Array.from({ length: 10 }, () => ({
					type: "execute_bash" as const,
					command: "echo ok",
				})),
			},
			10,
		);
		expect(payload.actions).toHaveLength(10);
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
});

describe("objective planner schema", () => {
	it("rejects apply_diff when objective mutations are disabled", () => {
		const schema = createSubmitActionBatchToolSchema(5);

		expect(Value.Check(schema, {
			actions: [
				{
					type: "apply_diff",
					path: "src/index.ts",
					oldText: "foo",
					newText: "bar",
				},
			],
		})).toBe(false);
	});

	it("allows apply_diff when objective mutations are enabled", () => {
		const schema = createSubmitActionBatchToolSchema(5, {
			allowMutatingActions: true,
		});

		expect(Value.Check(schema, {
			actions: [
				{
					type: "apply_diff",
					path: "src/index.ts",
					oldText: "foo",
					newText: "bar",
				},
			],
		})).toBe(true);
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

	it("flags batch count violations before schema parse", () => {
		expect(
			validateBatchActionCount({ actions: [] }, 10),
		).toMatch(/at least/);
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

describe("result schema", () => {
	it("validates a halted batch execution result", () => {
		const result = {
			batchId: "batch-2",
			haltedPrematurely: true,
			haltReason: "non_zero_exit" as const,
			haltedAtIndex: 1,
			completedCount: 1,
			totalRequested: 3,
			results: [
				{
					index: 0,
					type: "execute_bash" as const,
					success: true,
					exitCode: 0,
					durationMs: 12,
					command: "echo ok",
					stdout: { text: "ok\n" },
					stderr: { text: "" },
				},
				{
					index: 1,
					type: "execute_bash" as const,
					success: false,
					exitCode: 1,
					durationMs: 8,
					error: "command failed",
					haltReason: "non_zero_exit" as const,
					command: "false",
					stdout: { text: "" },
					stderr: { text: "error\n" },
				},
			],
			shellState: {
				sessionId: "sess-1",
				cwd: "/workspace",
				alive: true,
				lastExitCode: 1,
			},
			startedAtMs: 1000,
			completedAtMs: 1020,
			durationMs: 20,
		};

		expect(Value.Check(createBatchExecutionResultSchema(), result)).toBe(true);
		expect(Value.Check(createActionBatchPayloadSchema(), { actions: [] })).toBe(
			false,
		);
	});
});

describe("typebox instance consistency", () => {
	const KIND = Symbol.for("TypeBox.Kind");

	it("builds schemas carrying TypeBox Kind symbols", () => {
		// Oh My Pi rewrites bare `@sinclair/typebox` imports to a zod-backed shim
		// that emits symbol-less JSON Schema, which makes `Value.Check` throw
		// "Unknown type". Schemas must come from the real TypeBox instance.
		const payload = createActionBatchPayloadSchema();
		expect((payload as unknown as Record<symbol, unknown>)[KIND]).toBe("Object");
		expect((QueueActionSchema as unknown as Record<symbol, unknown>)[KIND]).toBe(
			"Union",
		);
		expect(
			(createBatchExecutionResultSchema() as unknown as Record<symbol, unknown>)[
				KIND
			],
		).toBe("Object");
	});

	it("validates a driver-supplied explicit read_lines batch", () => {
		expect(
			Value.Check(createActionBatchPayloadSchema(10), {
				actions: [
					{ type: "read_lines", path: "buggy.py", startLine: 1, endLine: 5 },
				],
			}),
		).toBe(true);
	});

	it("never imports the bare @sinclair/typebox specifier in src/", async () => {
		const { Glob } = await import("bun");
		const { readFileSync } = await import("node:fs");
		const offenders: string[] = [];
		for await (const file of new Glob("src/**/*.ts").scan(".")) {
			const source = readFileSync(file, "utf8");
			if (/from\s+["']@sinclair\/typebox["']/.test(source)) offenders.push(file);
		}
		expect(offenders).toEqual([]);
	});
});
