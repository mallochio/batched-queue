import { describe, expect, it } from "bun:test";
import {
	formatBatchResult,
	buildBatchContinuationHints,
	formatBatchResultPreview,
} from "../src/format-batch-result";
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
	it("includes rationale when provided", () => {
		const hints = buildBatchContinuationHints(baseResult(), {
			rationale: "read config files first",
		});
		expect(hints.some((hint) => hint.includes("read config files first"))).toBe(true);
	});

	it("suggests replan on halt", () => {
		const hints = buildBatchContinuationHints(
			baseResult({
				haltedPrematurely: true,
				haltedAtIndex: 2,
				completedCount: 2,
			}),
		);
		expect(hints.some((hint) => hint.includes("Replan"))).toBe(true);
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

	it("suggests follow-up objective or actions on success", () => {
		const objectiveHints = buildBatchContinuationHints(baseResult(), { usedObjective: true });
		const actionHints = buildBatchContinuationHints(baseResult(), { usedObjective: false });
		expect(objectiveHints.some((hint) => hint.includes("refined objective"))).toBe(true);
		expect(actionHints.some((hint) => hint.includes("explicit actions"))).toBe(true);
	});
	it("renders compact preview unless expanded", () => {
		const result = baseResult({
			results: [
				{
					index: 0,
					type: "execute_bash",
					success: true,
					exitCode: 0,
					durationMs: 1,
					command: "printf ok",
					stdout: { text: "ok" },
					stderr: { text: "" },
				},
			],
		});

		const compact = formatBatchResultPreview(result);
		expect(compact).toContain("✓ batch completed");
		expect(compact).toContain("actions: ✓ [0] execute_bash: printf ok");
		expect(compact).not.toContain("stdout:");

		const expanded = formatBatchResultPreview(result, { expanded: true });
		expect(expanded).toContain("stdout:");
	});
});

describe("formatBatchResult", () => {
	it("renders next-steps section", () => {
		const text = formatBatchResult(baseResult(), {
			rationale: "inspect entrypoints",
			usedObjective: true,
		});
		expect(text).toContain("next steps:");
		expect(text).toContain("plan rationale: inspect entrypoints");
		expect(text).toContain("batch completed successfully");
	});
});
