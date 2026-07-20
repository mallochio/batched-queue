import { describe, expect, it } from "bun:test";
import { addPlannerUsage, emptyPlannerUsage, finalizePlannerUsage } from "../src/planner-usage";

describe("planner usage accounting", () => {
	it("accumulates Pi Usage shapes with cost totals", () => {
		const acc = emptyPlannerUsage("openai", "gpt-4.1-nano");
		addPlannerUsage(acc, {
			input: 10,
			output: 5,
			cacheRead: 0,
			cacheWrite: 0,
			reasoning: 2,
			totalTokens: 15,
			cost: { input: 0.0001, output: 0.0002, cacheRead: 0, cacheWrite: 0, total: 0.0003 },
		});
		addPlannerUsage(acc, {
			input: 20,
			output: 8,
			cacheRead: 0,
			cacheWrite: 0,
			reasoning: 0,
			totalTokens: 28,
			cost: { input: 0.0002, output: 0.0003, cacheRead: 0, cacheWrite: 0, total: 0.0005 },
		});
		const usage = finalizePlannerUsage(acc);
		expect(usage.calls).toBe(2);
		expect(usage.inputTokens).toBe(30);
		expect(usage.outputTokens).toBe(13);
		expect(usage.reasoningTokens).toBe(2);
		expect(usage.totalTokens).toBe(43);
		expect(usage.costUsd).toBeCloseTo(0.0008, 6);
	});

	it("tolerates missing fields and numeric strings", () => {
		const acc = emptyPlannerUsage("anthropic", "claude-sonnet-4");
		addPlannerUsage(acc, {
			input: "5",
			output: "3",
			totalTokens: "8",
		});
		const usage = finalizePlannerUsage(acc, false);
		expect(usage.inputTokens).toBe(5);
		expect(usage.outputTokens).toBe(3);
		expect(usage.totalTokens).toBe(8);
		expect(usage.costUsd).toBe(0);
		expect(usage.raw).toBeUndefined();
	});
});
