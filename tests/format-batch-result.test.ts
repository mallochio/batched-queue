import { describe, expect, it } from "bun:test";
import { buildBatchContinuationHints, formatBatchResult } from "../src/format-batch-result";
import type { BatchExecutionResult } from "../src/results";

function baseResult(overrides: Partial<BatchExecutionResult> = {}): BatchExecutionResult {
	return {
		haltedPrematurely: false,
		completedCount: 1,
		totalRequested: 1,
		results: [],
		shellState: { sessionId: "test", cwd: "/tmp", alive: true, lastExitCode: 0 },
		startedAtMs: 0,
		completedAtMs: 10,
		durationMs: 10,
		...overrides,
	};
}

describe("buildBatchContinuationHints", () => {
	it("suggests replan on halt", () => {
		const hints = buildBatchContinuationHints(
			baseResult({
				haltedPrematurely: true,
				haltedAtIndex: 2,
				completedCount: 2,
			}),
		);
		expect(hints.some((hint) => hint.includes("Fix the failing step"))).toBe(true);
	});

	it("warns when workspace changed via apply_diff", () => {
		const hints = buildBatchContinuationHints(
			baseResult({
				results: [
					{
						index: 0,
						type: "apply_diff",
						success: true,
						exitCode: 0,
						durationMs: 1,
						path: "a.ts",
						applied: true,
						bytesBefore: 1,
						bytesAfter: 2,
					},
				],
			}),
		);
		expect(hints.some((hint) => hint.includes("Workspace changed"))).toBe(true);
	});

	it("adds no hints for a clean read-only batch", () => {
		expect(buildBatchContinuationHints(baseResult())).toEqual([]);
	});
});

describe("formatBatchResult", () => {
	it("renders ACP-friendly markdown", () => {
		const command = "printf 'ok'";
		const text = formatBatchResult(baseResult({
			results: [
				{
					index: 0,
					type: "execute_bash",
					success: true,
					exitCode: 0,
					durationMs: 1,
					command,
					stdout: { text: "ok" },
					stderr: { text: "" },
				},
			],
		}));

		expect(text).toContain("✅ batch completed");
		expect(text).toContain("- cwd: `/tmp`");
		expect(text).toContain("### Executed actions");
		expect(text).toContain("#### ✅ [0] execute_bash");
		expect(text).toContain("```bash\n" + command + "\n```");
		expect(text).toContain("<summary>stdout</summary>");
		expect(text).not.toContain("### Next steps");
	});
});
