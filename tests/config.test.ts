import { afterEach, describe, expect, it } from "bun:test";
import { resolveBatchQueueConfig } from "../src/config";
import { parseBatchQueueJsonConfig } from "../src/file-config";

const executorEnv = [
	"BATCH_QUEUE_EXECUTOR",
	"BATCH_QUEUE_EXECUTOR_PROVIDER",
	"BATCH_QUEUE_EXECUTOR_MODEL",
	"BATCH_QUEUE_EXECUTOR_BASE_URL",
	"BATCH_QUEUE_EXECUTOR_API_KEY",
	"BATCH_QUEUE_EXECUTOR_THINKING",
] as const;

const savedEnv = Object.fromEntries(executorEnv.map((name) => [name, process.env[name]]));

afterEach(() => {
	for (const name of executorEnv) {
		const value = savedEnv[name];
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
});

describe("objective executor configuration", () => {
	it("ignores objective executor settings in JSON", () => {
		expect(parseBatchQueueJsonConfig({
			executionModel: "openai/gpt-5.4-mini",
			executorModel: "openai/gpt-5.4-nano",
			executorBaseUrl: "http://127.0.0.1:8080/v1",
			executorApiKey: "sk-test",
			executorThinking: "high",
			maxBatchActions: 8,
		})).toEqual({ maxBatchActions: 8 });
	});

	it("reads the model, endpoint, key, and thinking only from env", () => {
		process.env.BATCH_QUEUE_EXECUTOR = "bifrost/gemini-3.7-flash";
		process.env.BATCH_QUEUE_EXECUTOR_BASE_URL = "http://127.0.0.1:8080/v1";
		process.env.BATCH_QUEUE_EXECUTOR_API_KEY = "sk-test";
		process.env.BATCH_QUEUE_EXECUTOR_THINKING = "high";

		const resolved = resolveBatchQueueConfig();
		expect(resolved.executorModel).toEqual({
			provider: "bifrost",
			id: "gemini-3.7-flash",
		});
		expect(resolved.executorBaseUrl).toBe("http://127.0.0.1:8080/v1");
		expect(resolved.executorApiKey).toBe("sk-test");
		expect(resolved.executorThinking).toBe("high");
	});

	it("supports split provider and model env vars", () => {
		delete process.env.BATCH_QUEUE_EXECUTOR;
		process.env.BATCH_QUEUE_EXECUTOR_PROVIDER = "bifrost";
		process.env.BATCH_QUEUE_EXECUTOR_MODEL = "gemini-3.7-flash";
		expect(resolveBatchQueueConfig().executorModel).toEqual({
			provider: "bifrost",
			id: "gemini-3.7-flash",
		});
	});
});

describe("other batch queue configuration", () => {
	it("parses JSON settings unrelated to the objective executor", () => {
		expect(parseBatchQueueJsonConfig({
			maxBatchActions: 8,
			groundingTurns: 1,
			requirePlanReflection: false,
			allowObjectiveMutations: true,
		})).toEqual({
			maxBatchActions: 8,
			groundingTurns: 1,
			requirePlanReflection: false,
			allowObjectiveMutations: true,
		});
	});

	it("keeps defaults", () => {
		delete process.env.BATCH_QUEUE_MAX_ACTIONS;
		delete process.env.BATCH_QUEUE_GROUNDING_TURNS;
		delete process.env.BATCH_QUEUE_REQUIRE_PLAN_REFLECTION;
		delete process.env.BATCH_QUEUE_ALLOW_OBJECTIVE_MUTATIONS;
		const resolved = resolveBatchQueueConfig();
		expect(resolved.maxBatchActions).toBe(10);
		expect(resolved.groundingTurns).toBe(3);
		expect(resolved.requirePlanReflection).toBe(true);
		expect(resolved.allowObjectiveMutations).toBe(false);
	});
});
