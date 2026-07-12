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
		const longCommand = "printf 'this is a deliberately long command that should remain fully visible in the compact native renderer'";
		const result = baseResult({
			results: [
				{
					index: 0,
					type: "execute_bash",
					success: true,
					exitCode: 0,
					durationMs: 1,
					command: longCommand,
					stdout: { text: "ok" },
					stderr: { text: "" },
				},
			],
		});

		const compact = formatBatchResultPreview(result);
		expect(compact).toContain("✓ batch completed");
		expect(compact).toContain(`actions:\n  ✓  0 bash  ${longCommand}`);
		expect(compact).not.toContain("…");
		expect(compact).not.toContain("stdout:");

		const expanded = formatBatchResultPreview(result, { expanded: true });
		expect(expanded).toContain("<summary>stdout</summary>");
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
		}), {
			rationale: "inspect entrypoints",
			usedObjective: true,
		});

		expect(text).toContain("✅ batch completed");
		expect(text).toContain("- cwd: `/tmp`");
		expect(text).toContain("### Executed actions");
		expect(text).toContain("#### ✅ [0] execute_bash");
		expect(text).toContain("```bash\n" + command + "\n```");
		expect(text).toContain("<summary>stdout</summary>");
		expect(text).toContain("### Next steps");
		expect(text).toContain("plan rationale: inspect entrypoints");
	});
});
