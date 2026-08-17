import { describe, expect, it } from "bun:test";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { resolvePlanningModel } from "../src/analyzer";

function fakeModel(provider: string, id: string): Model<Api> {
	return {
		id,
		name: id,
		api: "openai-responses",
		provider: provider as Model<Api>["provider"],
		baseUrl: `https://${provider}.example/v1`,
		reasoning: true,
		input: ["text"],
		cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 400_000,
		maxTokens: 128_000,
	};
}

function registry(models: Model<Api>[]): ModelRegistry {
	return {
		find: (provider: string, id: string) =>
			models.find((m) => m.provider === provider && m.id === id),
	} as unknown as ModelRegistry;
}

describe("resolvePlanningModel", () => {
	const driver = fakeModel("azure-openai-responses", "gpt-5.6-luna");

	it("returns the catalog model when found", () => {
		const catalog = fakeModel("google-vertex", "gemini-2.5-flash");
		const resolved = resolvePlanningModel(
			{ provider: "google-vertex", id: "gemini-2.5-flash" },
			driver,
			registry([catalog]),
		);
		expect(resolved).toBe(catalog);
	});

	it("reuses the driver when the planner ref is the driver", () => {
		const resolved = resolvePlanningModel(
			{ provider: "azure-openai-responses", id: "gpt-5.6-luna" },
			driver,
			registry([]),
		);
		expect(resolved).toBe(driver);
	});

	it("clones the driver transport for a custom deployment on the same provider", () => {
		const resolved = resolvePlanningModel(
			{ provider: "azure-openai-responses", id: "grok-4.3" },
			driver,
			registry([]),
		);
		expect(resolved.id).toBe("grok-4.3");
		expect(resolved.name).toBe("grok-4.3");
		expect(resolved.provider).toBe("azure-openai-responses");
		expect(resolved.baseUrl).toBe(driver.baseUrl);
		expect(resolved.api).toBe(driver.api);
		// Reasoning is disabled on the clone so Pi never sends the
		// `reasoning.encrypted_content` include that custom Azure deployments reject.
		expect(resolved.reasoning).toBe(false);
	});

	it("overrides baseUrl when a custom endpoint is supplied", () => {
		const resolved = resolvePlanningModel(
			{ provider: "bifrost", id: "vertex/google/gemini-3.7-flash" },
			driver,
			registry([]),
			{ baseUrl: "http://127.0.0.1:8080/v1" },
		);
		expect(resolved.id).toBe("vertex/google/gemini-3.7-flash");
		expect(resolved.baseUrl).toBe("http://127.0.0.1:8080/v1");
		expect(resolved.api).toBe("openai-completions");
	});

	it("throws for an unknown model on a different provider", () => {
		expect(() =>
			resolvePlanningModel(
				{ provider: "amazon-bedrock", id: "mystery" },
				driver,
				registry([]),
			),
		).toThrow(/planning model not found: amazon-bedrock\/mystery/);
	});
});
