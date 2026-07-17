import { describe, expect, it } from "bun:test";
import { resolveBatchQueueConfig } from "../src/config";
import { createRunnerMap, executeBatchQueue } from "../src/execute-batch-queue";

const config = resolveBatchQueueConfig();
const deps = {
	getSessionId: () => "execute-test",
	getCwd: () => process.cwd(),
	resolveObjective: async () => ({
		actions: [{ type: "read_lines" as const, path: "package.json", startLine: 1, endLine: 1 }],
		rationale: "read package metadata",
		reflection: {
			confidence: 5,
			successCriteria: "package metadata is returned",
			risks: [],
		},
	}),
};

describe("executeBatchQueue input selection", () => {
	it("accepts objective-only and actions-only requests", async () => {
		for (const params of [
			{ objective: "read the package name" },
			{ actions: [{ type: "read_lines" as const, path: "package.json", startLine: 1, endLine: 1 }] },
		]) {
			const result = await executeBatchQueue({
				config,
				params,
				deps,
				runners: createRunnerMap(),
			});
			expect(result.isError).toBe(false);
			if ("objective" in params) {
				expect(result.rationale).toBe("read package metadata");
				expect(result.reflection?.confidence).toBe(5);
			}
		}
	});

	it("rejects both objective and actions", async () => {
		const result = await executeBatchQueue({
			config,
			params: {
				objective: "read the package name",
				actions: [{ type: "read_lines", path: "package.json" }],
			},
			deps,
			runners: createRunnerMap(),
		});

		expect(result.isError).toBe(true);
		expect(result.error).toBe("objective and actions are mutually exclusive");
		expect(result.result).toBeUndefined();
	});

	it("rejects requests with neither input", async () => {
		const result = await executeBatchQueue({
			config,
			params: {},
			deps,
			runners: createRunnerMap(),
		});
		expect(result.error).toBe("missing objective or actions");
	});
});
