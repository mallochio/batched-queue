import { describe, expect, it } from "bun:test";
import { resolveBatchQueueConfig } from "../src/config";
import {
	analyzeOpenCodeV2BatchObjective,
	resolveOpenCodeV2SessionModelRef,
} from "../src/opencode/analyzer-v2";

describe("OpenCode V2 objective analyzer", () => {
	it("resolves the session model from SessionInfo.model", async () => {
		const model = await resolveOpenCodeV2SessionModelRef(
			async () => ({
				model: { id: "gpt-5.4-mini", providerID: "openai" },
			}),
			"session-1",
		);
		expect(model).toEqual({ provider: "openai", id: "gpt-5.4-mini" });
	});

	it("parses JSON actions from generate.text", async () => {
		const result = await analyzeOpenCodeV2BatchObjective(
			{
				sessionGet: async () => ({
					model: { id: "gpt-5.4-mini", providerID: "openai" },
				}),
				generateText: async () => ({
					text: JSON.stringify({
						actions: [
							{ type: "read_lines", path: "src/config.ts", startLine: 1, endLine: 20 },
						],
						rationale: "inspect config",
						reflection: {
							confidence: 4,
							successCriteria: "config header read",
							risks: [],
							fallback: "use explicit actions",
						},
					}),
				}),
			},
			"session-1",
			"Read the config header",
			resolveBatchQueueConfig({ requirePlanReflection: true }),
		);

		expect(result.payload.actions).toHaveLength(1);
		expect(result.payload.actions[0]?.type).toBe("read_lines");
		expect(result.payload.rationale).toBe("inspect config");
	});
});
