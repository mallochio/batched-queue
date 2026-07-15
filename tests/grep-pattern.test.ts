import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_OUTPUT_LIMITS } from "../src/constants";
import { executeGrepPattern } from "../src/executors/grep-pattern";

const tmpParent = path.join(path.dirname(fileURLToPath(import.meta.url)), ".tmp");

describe("executeGrepPattern", () => {
	let tmpDir: string;

	beforeEach(() => {
		fs.mkdirSync(tmpParent, { recursive: true });
		tmpDir = fs.mkdtempSync(path.join(tmpParent, "bq-grep-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("stops ripgrep after the configured match limit", async () => {
		fs.writeFileSync(path.join(tmpDir, "many.txt"), "needle\n".repeat(10_000));
		const result = await executeGrepPattern(
			{ type: "grep_pattern", pattern: "needle", path: "." },
			0,
			{
				workspaceRoot: tmpDir,
				gitWorkspaceRoot: tmpDir,
				limits: DEFAULT_OUTPUT_LIMITS,
				defaultTimeoutMs: 5_000,
			},
		);

		expect(result.success).toBe(true);
		expect(result.exitCode).toBe(0);
		expect(result.matches).toHaveLength(DEFAULT_OUTPUT_LIMITS.maxGrepMatches);
		expect(result.matchCount).toBe(DEFAULT_OUTPUT_LIMITS.maxGrepMatches);
		expect(result.truncated).toBe(true);
		expect(result.truncation).toMatchObject({
			totalUnits: DEFAULT_OUTPUT_LIMITS.maxGrepMatches + 1,
			headUnits: DEFAULT_OUTPUT_LIMITS.maxGrepMatches,
			omittedUnits: 1,
		});
	});
});
