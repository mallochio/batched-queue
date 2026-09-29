import { afterEach, describe, expect, it } from "bun:test";
import { resolveBatchQueueConfig } from "../src/config";
import {
	analyzeOpenCodeV2BatchObjective,
	openCodeSessionDirectory,
	resolveOpenCodeV2SessionModelRef,
} from "../src/opencode/analyzer-v2";

const endpointEnv = ["BATCH_QUEUE_EXECUTOR_BASE_URL", "BATCH_QUEUE_EXECUTOR_API_KEY", "BATCH_QUEUE_EXECUTOR_THINKING"] as const;
const savedEnv = Object.fromEntries(endpointEnv.map((name) => [name, process.env[name]]));

afterEach(() => {
	for (const name of endpointEnv) {
		const value = savedEnv[name];
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
});

const plannedBatch = JSON.stringify({
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
});

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

	it("uses the session location as the working directory", () => {
		expect(openCodeSessionDirectory({
			location: { directory: "/workspace/app" },
		})).toBe("/workspace/app");
	});

	it("rejects a session with no directory", () => {
		expect(() => openCodeSessionDirectory({})).toThrow(/session directory/);
	});

	it("parses JSON actions from generate.text without a thinking variant", async () => {
		process.env.BATCH_QUEUE_EXECUTOR_THINKING = "high";
		let seenModel: { variant?: string } | null | undefined;
		const result = await analyzeOpenCodeV2BatchObjective(
			{
				sessionGet: async () => ({
					model: { id: "gpt-5.4-mini", providerID: "openai" },
				}),
				generateText: async (input) => {
					seenModel = input.model;
					return { text: plannedBatch };
				},
			},
			"session-1",
			"Read the config header",
			resolveBatchQueueConfig({ requirePlanReflection: true }),
		);

		expect(result.payload.actions).toHaveLength(1);
		expect(result.payload.actions[0]?.type).toBe("read_lines");
		expect(seenModel?.variant).toBeUndefined();
	});

	it("refuses custom executor endpoints", async () => {
		process.env.BATCH_QUEUE_EXECUTOR_BASE_URL = "http://127.0.0.1:9/v1";
		await expect(analyzeOpenCodeV2BatchObjective(
			{
				sessionGet: async () => ({
					model: { id: "gpt-5.4-mini", providerID: "openai" },
				}),
				generateText: async () => ({ text: plannedBatch }),
			},
			"session-1",
			"Read the config header",
			resolveBatchQueueConfig(),
		)).rejects.toThrow(/BATCH_QUEUE_EXECUTOR_BASE_URL/);
	});
});
