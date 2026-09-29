import { describe, expect, it } from "bun:test";
import { BatchQueueRunners, executeBatchQueue } from "../src/execute-batch-queue";

const session = { sessionId: "execute-test", cwd: process.cwd() };

describe("executeBatchQueue", () => {
	it("runs a valid batch", async () => {
		const runners = new BatchQueueRunners();
		const result = await executeBatchQueue(
			{ actions: [{ type: "read_lines", path: "package.json", startLine: 1, endLine: 1 }] },
			session,
			runners,
		);
		await runners.disposeAll();
		expect(result.isError).toBe(false);
		expect(result.text).toContain("✅ batch completed");
	});

	it("rejects an empty batch", async () => {
		const result = await executeBatchQueue({ actions: [] }, session, new BatchQueueRunners());
		expect(result.isError).toBe(true);
		expect(result.result).toBeUndefined();
	});

	it("rejects unknown fields", async () => {
		const result = await executeBatchQueue(
			{ actions: [{ type: "read_lines", path: "package.json", bindTo: "x" } as never] },
			session,
			new BatchQueueRunners(),
		);
		expect(result.isError).toBe(true);
	});
});
