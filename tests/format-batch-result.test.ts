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
		expect(hints.some((hint) => hint.includes("resend only the remaining steps"))).toBe(true);
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
		expect(hints.some((hint) => hint.includes("Files changed"))).toBe(true);
	});

	it("adds no hints for a clean read-only batch", () => {
		expect(buildBatchContinuationHints(baseResult())).toEqual([]);
	});
});

describe("formatBatchResult", () => {
	it("renders compact fixed-layout text", () => {
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

		expect(text).toContain("✓ batch completed: 1/1 actions");
		expect(text).toContain("cwd /tmp");
		expect(text).toContain("[0] ✓ bash `" + command + "`");
		expect(text).toContain("```\nok\n```");
		expect(text).not.toContain("next:");
	});
});
