import { describe, expect, it } from "bun:test";
import { analyzerSystemPrompt, planBatchWithGrounding, type PlanBatchDeps } from "../src/analyzer";
import { resolveBatchQueueConfig } from "../src/config";

function baseDeps(overrides: Partial<PlanBatchDeps> = {}): PlanBatchDeps {
	return {
		objective: "find and read the config loader",
		config: resolveBatchQueueConfig({}, { groundingTurns: 2 }),
		cwd: "/tmp",
		complete: async () => ({ stopReason: "stop", content: [] }),
		runInspect: async () => "",
		...overrides,
	};
}

describe("planBatchWithGrounding", () => {
	it("inspects, feeds results back, then submits", async () => {
		const inspected: string[] = [];
		let turn = 0;
		const deps = baseDeps({
			runInspect: async (name, args) => {
				inspected.push(`${name}:${JSON.stringify(args)}`);
				return "src/config.ts:1: export function loadFileConfig() {}";
			},
			complete: async (context) => {
				turn += 1;
				if (turn === 1) {
					// Model should see only grounding + submit tools on the first turn.
					expect(context.tools.some((t) => t.name === "inspect_grep")).toBe(true);
					return {
						stopReason: "toolUse",
						content: [{ type: "toolCall", id: "c1", name: "inspect_grep", arguments: { pattern: "loadFileConfig" } }],
					};
				}
				// Second turn: prior tool result must be threaded back into messages.
				const hasToolResult = context.messages.some((m) => (m as { role: string }).role === "toolResult");
				expect(hasToolResult).toBe(true);
				return {
					stopReason: "toolUse",
					content: [{ type: "toolCall", id: "c2", name: "submit_action_batch", arguments: { actions: [{ type: "read_lines", path: "src/config.ts" }] } }],
				};
			},
		});

		const payload = await planBatchWithGrounding(deps);
		expect(inspected).toEqual(['inspect_grep:{"pattern":"loadFileConfig"}']);
		expect(payload.actions).toHaveLength(1);
		expect(payload.actions[0]?.type).toBe("read_lines");
	});

	it("includes planner reflection and typed binding guidance by default", () => {
		const prompt = analyzerSystemPrompt(resolveBatchQueueConfig(), false);
		expect(prompt).toContain("reflection");
		expect(prompt).toContain("confidence");
		expect(prompt).toContain("bindTo");
		expect(prompt).toContain("${name}");
	});

	it("forces submit-only tools on the final turn", async () => {
		let lastTools: string[] = [];
		const deps = baseDeps({
			config: resolveBatchQueueConfig({}, { groundingTurns: 0 }),
			complete: async (context) => {
				lastTools = context.tools.map((t) => t.name);
				return {
					stopReason: "toolUse",
					content: [{ type: "toolCall", id: "s", name: "submit_action_batch", arguments: { actions: [{ type: "grep_pattern", pattern: "x" }] } }],
				};
			},
		});
		await planBatchWithGrounding(deps);
		expect(lastTools).toEqual(["submit_action_batch"]);
	});

	it("retries once when the model replies without a tool call", async () => {
		let calls = 0;
		const deps = baseDeps({
			config: resolveBatchQueueConfig({}, { groundingTurns: 0 }),
			complete: async (context) => {
				calls += 1;
				if (calls === 1) {
					return { stopReason: "stop", content: [{ type: "text" }] };
				}
				expect(context.messages.some((message) =>
					JSON.stringify(message).includes("You must call submit_action_batch now"),
				)).toBe(true);
				return {
					stopReason: "toolUse",
					content: [{ type: "toolCall", id: "s", name: "submit_action_batch", arguments: { actions: [{ type: "grep_pattern", pattern: "x" }] } }],
				};
			},
		});

		const payload = await planBatchWithGrounding(deps);
		expect(calls).toBe(2);
		expect(payload.actions[0]?.type).toBe("grep_pattern");
	});

	it("throws when the model never submits", async () => {
		const deps = baseDeps({
			config: resolveBatchQueueConfig({}, { groundingTurns: 1 }),
			complete: async () => ({
				stopReason: "toolUse",
				content: [{ type: "toolCall", id: "g", name: "inspect_read", arguments: { path: "a" } }],
			}),
			runInspect: async () => "data",
		});
		await expect(planBatchWithGrounding(deps)).rejects.toThrow("stronger BATCH_QUEUE_EXECUTOR");
	});
});
