import { describe, expect, it } from "bun:test";
import { parseEventStream, summarizeRun } from "./parse-events.ts";

function makeEvent(type: string, payload: Record<string, unknown>): string {
	return JSON.stringify({ type, ...payload });
}

function batchQueueEvent(details: unknown, isError = false): string {
	const text = "✅ batch completed (2/2 actions, 12ms)\n- cwd: /tmp\n";
	return makeEvent("tool_execution_end", {
		toolName: "batch_queue",
		result: { content: [{ type: "text", text }], details },
		isError,
	});
}

function agentEndEvent(usage: Record<string, unknown>): string {
	return makeEvent("agent_end", {
		willRetry: false,
		messages: [],
		usage,
	});
}

describe("cost accounting from Pi JSON events", () => {
	it("extracts a single planner usage from batch_queue details", () => {
		const jsonl = [
			batchQueueEvent({
				plannerUsage: {
					provider: "openai",
					model: "gpt-4.1-nano",
					calls: 1,
					inputTokens: 100,
					outputTokens: 50,
					cacheReadTokens: 10,
					cacheWriteTokens: 0,
					reasoningTokens: 0,
					totalTokens: 150,
					costUsd: 0.00075,
				},
			}),
			agentEndEvent({ input: 20, output: 10, totalTokens: 30, cost: { total: 0.0001 } }),
		].join("\n");

		const parsed = parseEventStream(jsonl);
		expect(parsed.plannerUsage?.provider).toBe("openai");
		expect(parsed.plannerUsage?.model).toBe("gpt-4.1-nano");
		expect(parsed.plannerUsage?.inputTokens).toBe(100);
		expect(parsed.plannerUsage?.costUsd).toBe(0.00075);
		expect(parsed.plannerUsage?.costComplete).toBe(true);
	});

	it("aggregates planner usage across multiple batch_queue calls", () => {
		const jsonl = [
			batchQueueEvent({
				plannerUsage: {
					provider: "openai",
					model: "gpt-4.1-nano",
					calls: 1,
					inputTokens: 100,
					outputTokens: 50,
					cacheReadTokens: 0,
					cacheWriteTokens: 0,
					reasoningTokens: 0,
					totalTokens: 150,
					costUsd: 0.00075,
				},
			}),
			batchQueueEvent({
				plannerUsage: {
					provider: "openai",
					model: "gpt-4.1-nano",
					calls: 1,
					inputTokens: 80,
					outputTokens: 40,
					cacheReadTokens: 0,
					cacheWriteTokens: 0,
					reasoningTokens: 0,
					totalTokens: 120,
					costUsd: 0.0006,
				},
			}),
			agentEndEvent({ input: 10, output: 5, totalTokens: 15, cost: { total: 0.00005 } }),
		].join("\n");

		const parsed = parseEventStream(jsonl);
		expect(parsed.plannerUsage?.calls).toBe(2);
		expect(parsed.plannerUsage?.inputTokens).toBe(180);
		expect(parsed.plannerUsage?.outputTokens).toBe(90);
		expect(parsed.plannerUsage?.totalTokens).toBe(270);
		expect(parsed.plannerUsage?.costUsd).toBe(0.00135);
	});

	it("marks costComplete false when planner usage has tokens but zero cost", async () => {
		const jsonl = [
			batchQueueEvent({
				plannerUsage: {
					provider: "openai",
					model: "gpt-4.1-nano",
					calls: 1,
					inputTokens: 100,
					outputTokens: 50,
					totalTokens: 150,
					costUsd: 0,
				},
			}),
			agentEndEvent({ input: 20, output: 10, totalTokens: 30, cost: { total: 0.0001 } }),
		].join("\n");

		const summary = await summarizeRun({
			jsonl,
			scenario: "H1",
			condition: "batch",
			run: 1,
			model: "test",
			exitCode: 0,
			timedOut: false,
			elapsedMs: 100,
			predicate: () => true,
		});

		expect(summary.plannerUsage?.costComplete).toBe(false);
		expect(summary.costComplete).toBe(false);
	});

	it("leaves planner usage undefined and costComplete true for explicit action batch", async () => {
		const jsonl = [
			batchQueueEvent({ result: { completedCount: 2, totalRequested: 2 } }),
			agentEndEvent({ input: 20, output: 10, totalTokens: 30, cost: { total: 0.0001 } }),
		].join("\n");

		const summary = await summarizeRun({
			jsonl,
			scenario: "H1",
			condition: "native",
			run: 1,
			model: "test",
			exitCode: 0,
			timedOut: false,
			elapsedMs: 100,
			predicate: () => true,
		});

		expect(summary.plannerUsage).toBeUndefined();
		expect(summary.costComplete).toBe(true);
	});
});
