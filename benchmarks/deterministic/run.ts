#!/usr/bin/env bun
/**
 * Deterministic executor benchmark (D1–D8).
 *
 * Compares batched (one executeBatch call) vs unbatched (one executeBatch
 * per action) execution on the same action sequences.  No API keys, no models.
 *
 * Usage:
 *   bun run benchmarks/deterministic/run.ts           # run all, print report
 *   bun run benchmarks/deterministic/run.ts --json    # emit JSON lines too
 *
 * Acceptance criteria per DETERMINISTIC-PLAN.md:
 *   1. batched and unbatched produce equivalent expected results (D1, D7, D8)
 *   2. shell state persists within a batch              (D2)
 *   3. bindings resolve only after producer action      (D3)
 *   4. failed actions prevent later actions from running (D4)
 *   5. workspace / diff validation enforced             (D6)
 *   6. timeout recovery works                           (D5)
 *   7. independent-read control baseline                (D8)
 */

import { createBatchQueueRunner } from "../../src/queue-runner.ts";
import type { QueueAction } from "../../src/actions.ts";
import type { BatchExecutionResult, ActionExecutionResult } from "../../src/results.ts";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { createHash } from "node:crypto";

// ── Fixture ───────────────────────────────────────────────────────────────────

const FIXTURE_FILES: Record<string, string> = {
	"README.md": `# Deterministic benchmark fixture

This temporary repository is created by benchmarks/deterministic/run.ts
for exercising batch_queue executor mechanics without a model provider.
`,

	"src/config-loader.ts": [
		'export interface Config {',
		'  port: number;',
		'  host: string;',
		'  debug: boolean;',
		'}',
		'',
		'export function loadConfig(path: string): Config {',
		'  // Default config values',
		'  return { port: 8080, host: "localhost", debug: false };',
		'}',
		'',
		'export function validateConfig(config: Config): boolean {',
		'  return config.port > 0 && config.host.length > 0;',
		'}',
		'',
		'// MARKER:loadConfig-present',
	].join("\n"),

	"src/feature.ts": [
		'import { loadConfig, type Config } from "./config-loader";',
		'',
		'export function getFeatureStatus(): string {',
		'  const config = loadConfig("/etc/app/config.json");',
		'  return config.debug ? "enabled" : "disabled";',
		'}',
		'',
		'// MARKER:feature-module',
	].join("\n"),

	"tests/config-loader.test.ts": [
		'// Deterministic test script for config-loader',
		'const { loadConfig, validateConfig } = require("../src/config-loader");',
		'const config = loadConfig("/etc/app/config.json");',
		'const result = validateConfig(config);',
		'console.log("CHECK_RESULT=" + result);',
		'if (!result) process.exit(1);',
	].join("\n"),

	"nested/state.txt": "BENCH_MARKER=deterministic-42\n",

	"scripts/check.sh": [
		'#!/bin/bash',
		'echo "VERIFY_OK"',
		'echo "VTOK-secure-token-99"',
	].join("\n"),
};

function createFixture(root: string): void {
	for (const [filePath, content] of Object.entries(FIXTURE_FILES)) {
		const full = join(root, filePath);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, content);
	}
	writeFileSync(join(root, "scripts/check.sh"), FIXTURE_FILES["scripts/check.sh"], { mode: 0o755 });
}

function fixtureDigest(root: string): string {
	const h = createHash("sha256");
	for (const fp of Object.keys(FIXTURE_FILES).sort()) {
		h.update(fp);
	}
	return h.digest("hex").slice(0, 12);
}

// ── Measurement types ─────────────────────────────────────────────────────────

interface Assertion {
	name: string;
	pass: boolean;
	detail?: string;
}

interface ConditionMetrics {
	condition: "batched" | "unbatched";
	totalDurationMs: number;
	executorCallCount: number;
	totalActionsRequested: number;
	totalActionsCompleted: number;
	resultBytes: number;
	passed: boolean;
	haltedPrematurely: boolean;
	haltReason?: string;
	haltedAtIndex?: number;
	errors: string[];
	assertions: Assertion[];
	perActionMs: number[];
}

// ── Batched runner ───────────────────────────────────────────────────────────

async function runBatched(
	fixtureDir: string,
	actions: QueueAction[],
	assert: (result: BatchExecutionResult) => Assertion[],
): Promise<ConditionMetrics> {
	const runner = createBatchQueueRunner("det-batched", fixtureDir);
	const t0 = performance.now();
	const result = await runner.executeBatch({ actions, batchId: "det-batched" });
	const duration = performance.now() - t0;
	await runner.dispose();

	const assertions = assert(result);
	const resultBytes = result.results.reduce(
		(sum, r) => sum + (r.type === "execute_bash" ? (r as any).stdout?.text?.length ?? 0 : 0),
		0,
	);

	return {
		condition: "batched",
		totalDurationMs: Math.round(duration * 100) / 100,
		executorCallCount: 1,
		totalActionsRequested: result.totalRequested,
		totalActionsCompleted: result.completedCount,
		resultBytes,
		passed: assertions.every((a) => a.pass) && !result.error,
		haltedPrematurely: result.haltedPrematurely,
		haltReason: result.haltReason,
		haltedAtIndex: result.haltedAtIndex,
		errors: result.error ? [result.error] : [],
		assertions,
		perActionMs: result.results.map((r) => r.durationMs),
	};
}

// ── Unbatched runner ─────────────────────────────────────────────────────────

async function runUnbatched(
	fixtureDir: string,
	actions: QueueAction[],
	assert: (results: BatchExecutionResult[]) => Assertion[],
): Promise<ConditionMetrics> {
	const runner = createBatchQueueRunner("det-unbatched", fixtureDir);
	const results: BatchExecutionResult[] = [];
	const perActionMs: number[] = [];
	const t0 = performance.now();

	for (const action of actions) {
		const r = await runner.executeBatch({ actions: [action], batchId: "det-unbatched" });
		results.push(r);
		perActionMs.push(r.durationMs);
	}

	const duration = performance.now() - t0;
	await runner.dispose();

	const assertions = assert(results);
	const resultBytes = results.reduce(
		(sum, batch) =>
			sum +
			batch.results.reduce(
				(s, r) => s + (r.type === "execute_bash" ? (r as any).stdout?.text?.length ?? 0 : 0),
				0,
			),
		0,
	);

	const last = results[results.length - 1];

	return {
		condition: "unbatched",
		totalDurationMs: Math.round(duration * 100) / 100,
		executorCallCount: results.length,
		totalActionsRequested: results.reduce((s, r) => s + r.totalRequested, 0),
		totalActionsCompleted: results.reduce((s, r) => s + r.completedCount, 0),
		resultBytes,
		passed: assertions.every((a) => a.pass),
		haltedPrematurely: last?.haltedPrematurely ?? false,
		haltReason: last?.haltReason,
		haltedAtIndex: last?.haltedAtIndex,
		errors: results.filter((r) => r.error).map((r) => r.error!),
		assertions,
		perActionMs,
	};
}

// ── Scenario definitions ─────────────────────────────────────────────────────

interface Scenario {
	id: string;
	label: string;
	actions: QueueAction[];
	batchedAssert: (r: BatchExecutionResult) => Assertion[];
	unbatchedAssert: (rs: BatchExecutionResult[]) => Assertion[];
}

const SCENARIOS: Scenario[] = [
	// ── D1: dependent inspection ──────────────────────────────────────────
	{
		id: "D1",
		label: "dependent-inspection",
		actions: [
			{ type: "grep_pattern", pattern: "loadConfig", path: "src/config-loader.ts" },
			{ type: "read_lines", path: "src/config-loader.ts", startLine: 7, endLine: 9 },
			{ type: "execute_bash", command: "cat tests/config-loader.test.ts | head -3" },
		],
		batchedAssert: (r) => [
			{ name: "all-3-actions-completed", pass: r.completedCount === 3 && !r.haltedPrematurely },
			{ name: "grep-found-match", pass: r.results[0]?.type === "grep_pattern" && (r.results[0] as any).matchCount > 0 },
			{ name: "read-lines-returned", pass: r.results[1]?.type === "read_lines" && (r.results[1] as any).lines?.length > 0 },
			{ name: "bash-exit-0", pass: r.results[2]?.type === "execute_bash" && (r.results[2] as any).exitCode === 0 },
		],
		unbatchedAssert: (rs) => [
			{ name: "all-3-batches-completed", pass: rs.length === 3 && rs.every((r) => !r.haltedPrematurely) },
			{ name: "grep-found-match", pass: rs[0]?.results[0]?.type === "grep_pattern" && (rs[0].results[0] as any).matchCount > 0 },
			{ name: "read-lines-returned", pass: rs[1]?.results[0]?.type === "read_lines" && (rs[1].results[0] as any).lines?.length > 0 },
			{ name: "bash-exit-0", pass: rs[2]?.results[0]?.type === "execute_bash" && (rs[2].results[0] as any).exitCode === 0 },
		],
	},

	// ── D2: persistent shell state ───────────────────────────────────────
	{
		id: "D2",
		label: "persistent-shell-state",
		actions: [
			{ type: "execute_bash", command: "cd nested && export BQ_VAR=STATE-OK && echo DONE_1" },
			{ type: "execute_bash", command: "echo CWD:$(pwd) VAR:${BQ_VAR:-unset}" },
		],
		batchedAssert: (r) => {
			const second = r.results[1];
			const stdout = second?.type === "execute_bash" ? (second as any).stdout?.text ?? "" : "";
			const hasCwd = stdout.includes("nested");
			const hasVar = stdout.includes("STATE-OK");
			return [
				{ name: "2-actions-completed", pass: r.completedCount === 2 },
				{ name: "shell-state-persists-cwd", pass: hasCwd, detail: `stdout: ${stdout.trim()}` },
				{ name: "shell-state-persists-var", pass: hasVar, detail: `stdout: ${stdout.trim()}` },
			];
		},
		unbatchedAssert: (rs) => {
			const second = rs[1]?.results[0];
			const stdout = second?.type === "execute_bash" ? (second as any).stdout?.text ?? "" : "";
			const hasCwd = stdout.includes("nested");
			const hasVar = stdout.includes("STATE-OK");
			return [
				{ name: "2-batches-completed", pass: rs.length === 2 && rs.every((r) => !r.haltedPrematurely) },
				{ name: "shell-state-persists-cwd", pass: hasCwd, detail: `stdout: ${stdout.trim()}` },
				{ name: "shell-state-persists-var", pass: hasVar, detail: `stdout: ${stdout.trim()}` },
			];
		},
	},

	// ── D3: result binding ───────────────────────────────────────────────
	{
		id: "D3",
		label: "result-binding",
		actions: [
			{ type: "execute_bash", command: "grep BENCH_MARKER nested/state.txt | cut -d= -f2", bindTo: "marker" },
			{ type: "execute_bash", command: "echo consumed:${marker}" },
		],
		batchedAssert: (r) => {
			const second = r.results[1];
			const stdout = second?.type === "execute_bash" ? (second as any).stdout?.text ?? "" : "";
			return [
				{ name: "2-actions-completed", pass: r.completedCount === 2 },
				{ name: "binding-resolved", pass: stdout.includes("consumed:deterministic-42"), detail: `stdout: ${stdout.trim()}` },
			];
		},
		unbatchedAssert: (rs) => {
			// In unbatched mode, bindTo does not carry across executeBatch calls.
			// The second batch can't resolve ${marker} and halts with validation_failed.
			// This is expected — bindTo is a within-batch feature.
			return [
				{ name: "first-batch-ran", pass: rs[0]?.completedCount === 1 },
				{ name: "cross-batch-binding-blocked", pass: rs[1]?.haltReason === "validation_failed", detail: `haltReason=${rs[1]?.haltReason}` },
			];
		},
	},

	// ── D4: fast-fail ────────────────────────────────────────────────────
	{
		id: "D4",
		label: "fast-fail",
		actions: [
			{ type: "execute_bash", command: "echo FIRST_MARKER" },
			{ type: "execute_bash", command: "exit 1" },
			{ type: "execute_bash", command: "echo SHOULD_NOT_RUN" },
		],
		batchedAssert: (r) => {
			return [
				{ name: "halted-prematurely", pass: r.haltedPrematurely },
				{ name: "halted-at-index-1", pass: r.haltedAtIndex === 1 },
				{ name: "halt-reason-non-zero-exit", pass: r.haltReason === "non_zero_exit" },
				{ name: "only-2-actions-executed", pass: r.completedCount === 2 },
				{ name: "first-action-succeeded", pass: r.results[0]?.type === "execute_bash" && (r.results[0] as any).exitCode === 0 },
				{ name: "second-action-failed", pass: r.results[1]?.type === "execute_bash" && (r.results[1] as any).exitCode !== 0 },
				{ name: "trailing-mutation-blocked", pass: r.results.length === 2 },
			];
		},
		unbatchedAssert: (rs) => {
			return [
				{ name: "action-1-ran", pass: rs[0]?.results[0]?.type === "execute_bash" && (rs[0].results[0] as any).exitCode === 0 },
				{ name: "action-2-failed", pass: rs[1]?.results[0]?.type === "execute_bash" && (rs[1].results[0] as any).exitCode !== 0 },
				{ name: "action-3-ran-unbatched", pass: rs[2]?.completedCount === 1 }, // separate batch, not blocked
			];
		},
	},

	// ── D5: timeout recovery ─────────────────────────────────────────────
	{
		id: "D5",
		label: "timeout-recovery",
		actions: [
			{ type: "execute_bash", command: "echo BEFORE_TIMEOUT" },
			{ type: "execute_bash", command: "sleep 5", timeoutMs: 500 },
		],
		batchedAssert: (r) => {
			const timedOut = r.haltReason === "timeout" || (r.results[1]?.type === "execute_bash" && (r.results[1] as any).exitCode === 124);
			return [
				{ name: "timeout-detected", pass: timedOut, detail: `haltReason=${r.haltReason}` },
				{ name: "first-action-ran", pass: r.results[0]?.type === "execute_bash" && (r.results[0] as any).exitCode === 0 },
			];
		},
		unbatchedAssert: (rs) => {
			const timedOut = rs[1]?.haltReason === "timeout" || (rs[1]?.results[0]?.type === "execute_bash" && (rs[1].results[0] as any).exitCode === 124);
			return [
				{ name: "timeout-detected", pass: timedOut, detail: `haltReason=${rs[1]?.haltReason}` },
				{ name: "first-action-ran", pass: rs[0]?.results[0]?.type === "execute_bash" && (rs[0].results[0] as any).exitCode === 0 },
			];
		},
	},

	// ── D6: workspace and mutation safety ────────────────────────────────
	{
		id: "D6",
		label: "workspace-mutation-safety",
		actions: [
			{ type: "execute_bash", command: "echo INSIDE_WORKSPACE" },
			{ type: "read_lines", path: "/etc/hostname" }, // outside workspace
			{ type: "execute_bash", command: "echo AFTER_READ" },
		],
		batchedAssert: (r) => {
			const outsideBlocked = r.results[1]?.type === "read_lines" && !(r.results[1] as any).success;
			return [
				{ name: "first-action-ran", pass: r.results[0]?.type === "execute_bash" && (r.results[0] as any).exitCode === 0 },
				{ name: "outside-read-blocked", pass: outsideBlocked, detail: `success=${(r.results[1] as any)?.success}` },
			];
		},
		unbatchedAssert: (rs) => {
			const outsideBlocked = rs[1]?.results[0]?.type === "read_lines" && !(rs[1].results[0] as any).success;
			return [
				{ name: "outside-read-blocked", pass: outsideBlocked, detail: `success=${(rs[1]?.results[0] as any)?.success}` },
			];
		},
	},

	// ── D7: apply and verify ─────────────────────────────────────────────
	{
		id: "D7",
		label: "apply-and-verify",
		actions: [
			{
				type: "apply_diff",
				path: "src/config-loader.ts",
				oldText: "  return { port: 8080, host: \"localhost\", debug: false };",
				newText: "  return { port: 9090, host: \"example.com\", debug: true };",
			},
			{ type: "execute_bash", command: "grep -q 'port: 9090' src/config-loader.ts && echo MODIFY_OK" },
		],
		batchedAssert: (r) => {
			const diffApplied = r.results[0]?.type === "apply_diff" && !!(r.results[0] as any).applied;
			const verifyPassed = r.results[1]?.type === "execute_bash" && (r.results[1] as any).exitCode === 0;
			const stdout = r.results[1]?.type === "execute_bash" ? (r.results[1] as any).stdout?.text ?? "" : "";
			return [
				{ name: "diff-applied", pass: diffApplied, detail: `applied=${(r.results[0] as any)?.applied}` },
				{ name: "verify-passed", pass: verifyPassed && stdout.includes("MODIFY_OK"), detail: `stdout: ${stdout.trim()}` },
			];
		},
		unbatchedAssert: (rs) => {
			const diffApplied = rs[0]?.results[0]?.type === "apply_diff" && !!(rs[0].results[0] as any).applied;
			const verifyPassed = rs[1]?.results[0]?.type === "execute_bash" && (rs[1].results[0] as any).exitCode === 0;
			const stdout = rs[1]?.results[0]?.type === "execute_bash" ? (rs[1].results[0] as any).stdout?.text ?? "" : "";
			return [
				{ name: "diff-applied", pass: diffApplied, detail: `applied=${(rs[0]?.results[0] as any)?.applied}` },
				{ name: "verify-passed", pass: verifyPassed && stdout.includes("MODIFY_OK"), detail: `stdout: ${stdout.trim()}` },
			];
		},
	},

	// ── D8: independent-read control baseline ────────────────────────────
	{
		id: "D8",
		label: "independent-read-control",
		actions: [
			{ type: "read_lines", path: "README.md", startLine: 1, endLine: 3 },
			{ type: "read_lines", path: "src/config-loader.ts", startLine: 1, endLine: 5 },
			{ type: "read_lines", path: "nested/state.txt", startLine: 1, endLine: 2 },
		],
		batchedAssert: (r) => [
			{ name: "all-3-reads-completed", pass: r.completedCount === 3 && !r.haltedPrematurely },
			{ name: "read-1-success", pass: r.results[0]?.type === "read_lines" && ((r.results[0] as any).lines?.length ?? 0) > 0 },
			{ name: "read-2-success", pass: r.results[1]?.type === "read_lines" && ((r.results[1] as any).lines?.length ?? 0) > 0 },
			{ name: "read-3-success", pass: r.results[2]?.type === "read_lines" && ((r.results[2] as any).lines?.length ?? 0) > 0 },
		],
		unbatchedAssert: (rs) => [
			{ name: "all-3-read-batches-completed", pass: rs.length === 3 && rs.every((r) => !r.haltedPrematurely) },
			{ name: "read-1-success", pass: rs[0]?.results[0]?.type === "read_lines" && ((rs[0].results[0] as any).lines?.length ?? 0) > 0 },
			{ name: "read-2-success", pass: rs[1]?.results[0]?.type === "read_lines" && ((rs[1].results[0] as any).lines?.length ?? 0) > 0 },
			{ name: "read-3-success", pass: rs[2]?.results[0]?.type === "read_lines" && ((rs[2].results[0] as any).lines?.length ?? 0) > 0 },
		],
	},
];

// ── Statistics ─────────────────────────────────────────────────────────────────

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[mid - 1] + sorted[mid]) / 2
		: sorted[mid];
}

function percentile(values: number[], p: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const idx = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
	);
	return sorted[idx];
}

// ── Aggregated metrics ───────────────────────────────────────────────────────

interface AggregatedMetrics {
	condition: "batched" | "unbatched";
	repCount: number;
	passCount: number;
	passRate: number;
	medianDurationMs: number;
	p95DurationMs: number;
	medianExecutorCalls: number;
	medianActionsRequested: number;
	medianActionsCompleted: number;
	medianResultBytes: number;
	haltedCount: number;
	medianPerActionMs: number[];
	allPassed: boolean;
	failedAssertions: number;
}

function aggregateMetrics(samples: ConditionMetrics[]): AggregatedMetrics {
	const n = samples.length;
	const passCount = samples.filter((s) => s.passed).length;
	const durationValues = samples.map((s) => s.totalDurationMs);

	// Median per-action timing across reps (each action position)
	const maxActions = Math.max(...samples.map((s) => s.perActionMs.length));
	const medianPerAction: number[] = [];
	for (let i = 0; i < maxActions; i++) {
		const atPos = samples.map((s) => s.perActionMs[i] ?? 0).filter((v) => v > 0);
		medianPerAction.push(atPos.length > 0 ? median(atPos) : 0);
	}

	const failedAssertions = samples.reduce(
		(sum, s) => sum + s.assertions.filter((a) => !a.pass).length,
		0,
	);

	return {
		condition: samples[0]?.condition ?? "batched",
		repCount: n,
		passCount,
		passRate: n > 0 ? passCount / n : 0,
		medianDurationMs: Math.round(median(durationValues) * 100) / 100,
		p95DurationMs: Math.round(percentile(durationValues, 95) * 100) / 100,
		medianExecutorCalls: median(samples.map((s) => s.executorCallCount)),
		medianActionsRequested: median(samples.map((s) => s.totalActionsRequested)),
		medianActionsCompleted: median(samples.map((s) => s.totalActionsCompleted)),
		medianResultBytes: median(samples.map((s) => s.resultBytes)),
		haltedCount: samples.filter((s) => s.haltedPrematurely).length,
		medianPerActionMs: medianPerAction,
		allPassed: passCount === n,
		failedAssertions,
	};
}

// ── Report ────────────────────────────────────────────────────────────────────

function fmtMs(ms: number): string {
	return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

function fmtPct(n: number): string {
	return `${(n * 100).toFixed(0)}%`;
}

function renderReport(
	allResults: Map<string, { id: string; label: string; batched: AggregatedMetrics; unbatched: AggregatedMetrics; fileDigest: string }>,
): string {
	const lines: string[] = [];
	const entries = [...allResults.values()];

	lines.push("# Deterministic benchmark report (D1–D8)");
	lines.push("");
	lines.push(`Run: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`);
	lines.push(`Repetitions: ${entries[0]?.batched.repCount ?? 1} per condition`);
	lines.push("");

	// Main results table
	lines.push("## Results");
	lines.push("");
	lines.push(`| Scenario | Condition | Reps | Pass rate | Median wall | P95 wall | Median exec calls | Actions (med) | Result bytes | Halted runs |`);
	lines.push(`| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`);

	for (const s of entries) {
		for (const m of [s.batched, s.unbatched]) {
			lines.push(
				`| ${s.id} | ${m.condition} | ${m.repCount} | ${fmtPct(m.passRate)} | ${fmtMs(m.medianDurationMs)} | ${fmtMs(m.p95DurationMs)} | ${m.medianExecutorCalls} | ${m.medianActionsCompleted}/${m.medianActionsRequested} | ${(m.medianResultBytes / 1024).toFixed(1)}KB | ${m.haltedCount} |`,
			);
		}
	}

	// Per-action timing table (median across reps)
	lines.push("");
	lines.push("## Per-action timing (median across reps)");
	lines.push("");
	lines.push(`| Scenario | Condition | Per-action median (ms) |`);
	lines.push(`| --- | --- | --- |`);
	for (const s of entries) {
		const bStr = s.batched.medianPerActionMs.map((ms) => `${Math.round(ms)}ms`).join(", ");
		const uStr = s.unbatched.medianPerActionMs.map((ms) => `${Math.round(ms)}ms`).join(", ");
		if (bStr) lines.push(`| ${s.id} | batched | ${bStr} |`);
		if (uStr) lines.push(`| ${s.id} | unbatched | ${uStr} |`);
	}

	// Reduction summary
	lines.push("");
	lines.push("## Executor-call reduction (batched vs unbatched)");
	lines.push("");
	for (const s of entries) {
		const bCalls = s.batched.medianExecutorCalls;
		const uCalls = s.unbatched.medianExecutorCalls;
		const reduction = uCalls > 0 ? ((1 - bCalls / uCalls) * 100).toFixed(0) : "—";
		lines.push(`- **${s.id}**: ${bCalls} vs ${uCalls} calls (${reduction}% reduction)`);
	}

	// Acceptance criteria
	lines.push("");
	lines.push("## Acceptance criteria");
	lines.push("");
	for (const s of entries) {
		const bOk = s.batched.allPassed;
		const uOk = s.unbatched.allPassed;
		const fails = s.batched.failedAssertions + s.unbatched.failedAssertions;
		const ok = bOk && uOk;
		lines.push(`- **${s.id}** (${s.label}): ${ok ? "✅ PASS" : "❌ FAIL"}  (batched: ${bOk ? "✅" : "❌"}, unbatched: ${uOk ? "✅" : "❌"}, ${fails} failed assertions)`);
	}

	// Summary stats
	const totalRuns = entries.reduce((s, e) => s + e.batched.repCount + e.unbatched.repCount, 0);
	const totalFails = entries.reduce(
		(s, e) => s + (e.batched.repCount - e.batched.passCount) + (e.unbatched.repCount - e.unbatched.passCount),
		0,
	);
	lines.push("");
	lines.push("## Summary");
	lines.push("");
	lines.push(`- Scenarios: ${entries.length} (${entries.map((r) => r.id).join(", ")})`);
	lines.push(`- Reps per condition: ${entries[0]?.batched.repCount ?? 1}`);
	lines.push(`- Total condition runs: ${totalRuns}`);
	lines.push(`- Failed runs: ${totalFails}`);
	lines.push(`- Overall pass rate: ${fmtPct(1 - totalFails / totalRuns)}`);
	lines.push(`- Fixture digest: ${entries[0]?.fileDigest ?? "unknown"}`);
	lines.push(`- Generated at: ${new Date().toISOString()}`);

	return lines.join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function runCondition(
	scenario: Scenario,
	condition: "batched" | "unbatched",
): Promise<ConditionMetrics> {
	const REPO = resolve(import.meta.dir, "..", "..");
	const fixtureDir = mkdtempSync(join(REPO, "tests/.tmp/bq-det-"));
	createFixture(fixtureDir);

	try {
		if (condition === "batched") {
			return await runBatched(fixtureDir, scenario.actions, scenario.batchedAssert);
		} else {
			return await runUnbatched(fixtureDir, scenario.actions, scenario.unbatchedAssert);
		}
	} finally {
		rmSync(fixtureDir, { recursive: true, force: true });
	}
}

async function main(): Promise<void> {
	const reps = parseReps();
	const allResults = new Map<string, { id: string; label: string; batched: AggregatedMetrics; unbatched: AggregatedMetrics; fileDigest: string }>();

	let totalRuns = 0;
	const tStart = performance.now();

	for (const scenario of SCENARIOS) {
		const batchedSamples: ConditionMetrics[] = [];
		const unbatchedSamples: ConditionMetrics[] = [];

		for (let rep = 0; rep < reps; rep++) {
			batchedSamples.push(await runCondition(scenario, "batched"));
			unbatchedSamples.push(await runCondition(scenario, "unbatched"));
		}

		const digest = fixtureDigest(
			mkdtempSync(join(resolve(import.meta.dir, "..", ".."), "tests/.tmp/bq-det-")),
		);

		allResults.set(scenario.id, {
			id: scenario.id,
			label: scenario.label,
			batched: aggregateMetrics(batchedSamples),
			unbatched: aggregateMetrics(unbatchedSamples),
			fileDigest: digest,
		});

		totalRuns += reps * 2;
	}

	const tElapsed = ((performance.now() - tStart) / 1000).toFixed(1);

	const report = renderReport(allResults);
	console.log(report);
	process.stderr.write(`\nCompleted ${totalRuns} runs in ${tElapsed}s\n`);

	// Exit non-zero if any scenario had a failing rep
	let anyFail = false;
	for (const r of allResults.values()) {
		if (!r.batched.allPassed || !r.unbatched.allPassed) {
			anyFail = true;
		}
	}
	if (anyFail) {
		process.exit(1);
	}
}

function parseReps(): number {
	for (let i = 0; i < process.argv.length - 1; i++) {
		if (process.argv[i] === "--reps") {
			const n = parseInt(process.argv[i + 1], 10);
			if (isNaN(n) || n < 1) {
				console.error("--reps must be a positive integer");
				process.exit(1);
			}
			return n;
		}
	}
	return 1;
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
