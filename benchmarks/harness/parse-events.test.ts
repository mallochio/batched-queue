import { expect, test } from "bun:test";
import { parseEventStream, summarizeRun } from "./parse-events.ts";

function line(obj: unknown): string {
	return JSON.stringify(obj);
}

const NATIVE_STREAM = [
	line({ type: "session", id: "s1", cwd: "/tmp/x" }),
	line({ type: "agent_start" }),
	line({ type: "turn_start" }),
	line({ type: "tool_execution_start", toolName: "grep", args: {} }),
	line({
		type: "tool_execution_end",
		toolName: "grep",
		result: { content: [{ type: "text", text: "match line" }] },
		isError: false,
	}),
	line({ type: "turn_end" }),
	line({ type: "turn_start" }),
	line({ type: "tool_execution_start", toolName: "read", args: {} }),
	line({
		type: "tool_execution_end",
		toolName: "read",
		result: { content: [{ type: "text", text: "file contents here" }] },
		isError: false,
	}),
	line({ type: "turn_end" }),
	line({
		type: "agent_end",
		willRetry: false,
		messages: [
			{ role: "user", content: [{ type: "text", text: "do it" }] },
			{
				role: "assistant",
				content: [{ type: "toolCall", name: "grep" }],
				usage: { input: 100, output: 10, totalTokens: 110, cost: { total: 0.001 } },
			},
			{
				role: "assistant",
				content: [{ type: "text", text: "VERIFY_OK token=VTOK-9C3" }],
				usage: { input: 120, output: 8, totalTokens: 128, cost: { total: 0.0012 } },
			},
		],
	}),
].join("\n");

const BATCH_STREAM = [
	line({ type: "session", id: "s2", cwd: "/tmp/y" }),
	line({ type: "turn_start" }),
	line({ type: "tool_execution_start", toolName: "batch_queue", args: {} }),
	line({
		type: "tool_execution_end",
		toolName: "batch_queue",
		result: {
			content: [
				{
					type: "text",
					text: "\u2705 batch completed (3/3 actions, 12ms)\n\n- cwd: `/tmp/y`",
				},
			],
		},
		isError: false,
	}),
	line({ type: "turn_end" }),
	line({
		type: "agent_end",
		willRetry: false,
		messages: [
			{
				role: "assistant",
				content: [{ type: "text", text: "VERIFY_OK token=VTOK-9C3" }],
				usage: { input: 200, output: 15, totalTokens: 215, cost: { total: 0.002 } },
			},
		],
	}),
].join("\n");

const HALT_STREAM = [
	line({ type: "turn_start" }),
	line({ type: "tool_execution_start", toolName: "batch_queue", args: {} }),
	line({
		type: "tool_execution_end",
		toolName: "batch_queue",
		isError: true,
		result: {
			content: [
				{
					type: "text",
					text: "\u274c batch halted at action 1 (nonzero exit) (1/3 actions, 5ms)",
				},
			],
		},
	}),
	line({ type: "agent_end", willRetry: false, messages: [] }),
].join("\n");

test("parses native sequential stream", () => {
	const p = parseEventStream(NATIVE_STREAM);
	expect(p.modelTurns).toBe(2);
	expect(p.toolCalls).toBe(2);
	expect(p.toolBreakdown).toEqual({ grep: 1, read: 1 });
	expect(p.usage.inputTokens).toBe(220);
	expect(p.usage.costUsd).toBeCloseTo(0.0022, 6);
	expect(p.batch.batchCalls).toBe(0);
	expect(p.reachedAgentEnd).toBe(true);
	expect(p.finalAssistantText).toContain("VERIFY_OK");
});

test("parses batch stream and extracts completed actions", () => {
	const p = parseEventStream(BATCH_STREAM);
	expect(p.toolCalls).toBe(1);
	expect(p.batch.batchCalls).toBe(1);
	expect(p.batch.completedActions).toBe(3);
	expect(p.batch.requestedActions).toBe(3);
});

test("detects halted batch and halt reason", () => {
	const p = parseEventStream(HALT_STREAM);
	expect(p.batch.haltedBatches).toBe(1);
	expect(p.batch.completedActions).toBe(1);
	expect(p.haltReason).toBe("nonzero exit");
});

test("tolerates malformed lines", () => {
	const p = parseEventStream(`${NATIVE_STREAM}\nnot json\n{"type":`);
	expect(p.parseErrors).toBe(2);
	expect(p.toolCalls).toBe(2);
});

test("summarizeRun computes action compression", () => {
	const nativeSummary = summarizeRun({
		scenario: "H1",
		condition: "native",
		run: 1,
		model: "m",
		exitCode: 0,
		timedOut: false,
		elapsedMs: 1000,
		jsonl: NATIVE_STREAM,
		predicate: (t) => t.includes("VERIFY_OK"),
	});
	expect(nativeSummary.actionsCompleted).toBe(2);
	expect(nativeSummary.actionCompression).toBe(1);
	expect(nativeSummary.verificationPassed).toBe(true);

	const batchSummary = summarizeRun({
		scenario: "H1",
		condition: "batch-explicit",
		run: 1,
		model: "m",
		exitCode: 0,
		timedOut: false,
		elapsedMs: 1000,
		jsonl: BATCH_STREAM,
		predicate: (t) => t.includes("VERIFY_OK"),
	});
	expect(batchSummary.actionsCompleted).toBe(3);
	expect(batchSummary.actionCompression).toBe(3);
	expect(batchSummary.verificationPassed).toBe(true);
});
