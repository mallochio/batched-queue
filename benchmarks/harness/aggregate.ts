// Aggregator + Markdown report generator for benchmark runs.
//
// Reads runs.json (array of RunSummary) and manifest.json from a results
// directory, computes per (scenario, condition) statistics, derived reductions
// relative to the native baseline, and writes aggregate.json + REPORT.md.
//
// Usage: bun benchmarks/harness/aggregate.ts <results-dir>

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ConditionId, Manifest, RunSummary } from "./types.ts";

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

function mean(values: number[]): number {
	if (values.length === 0) return 0;
	return values.reduce((a, b) => a + b, 0) / values.length;
}

interface CellStats {
	scenario: string;
	condition: ConditionId;
	n: number;
	successRate: number;
	medianTurns: number;
	medianToolCalls: number;
	medianActions: number;
	medianActionCompression: number;
	medianCost: number;
	medianPlannerCost: number;
	medianTotalCost: number;
	medianElapsedMs: number;
	p95ElapsedMs: number;
	medianInputTokens: number;
	medianOutputTokens: number;
	medianResultBytes: number;
	meanBatchCalls: number;
	haltedBatches: number;
	costComplete: boolean;
}

function totalCostUsd(r: RunSummary): number {
	return r.usage.costUsd + (r.plannerUsage?.costUsd ?? 0);
}

function computeCell(rows: RunSummary[]): CellStats {
	const driverCost = median(rows.map((r) => r.usage.costUsd));
	const plannerCost = median(rows.map((r) => r.plannerUsage?.costUsd ?? 0));
	return {
		scenario: rows[0].scenario,
		condition: rows[0].condition,
		n: rows.length,
		successRate: mean(rows.map((r) => (r.verificationPassed ? 1 : 0))),
		medianTurns: median(rows.map((r) => r.modelTurns)),
		medianToolCalls: median(rows.map((r) => r.toolCalls)),
		medianActions: median(rows.map((r) => r.actionsCompleted)),
		medianActionCompression: median(rows.map((r) => r.actionCompression)),
		medianCost: driverCost,
		medianPlannerCost: plannerCost,
		medianTotalCost: driverCost + plannerCost,
		medianElapsedMs: median(rows.map((r) => r.elapsedMs)),
		p95ElapsedMs: percentile(
			rows.map((r) => r.elapsedMs),
			95,
		),
		medianInputTokens: median(rows.map((r) => r.usage.inputTokens + (r.plannerUsage?.inputTokens ?? 0))),
		medianOutputTokens: median(rows.map((r) => r.usage.outputTokens + (r.plannerUsage?.outputTokens ?? 0))),
		medianResultBytes: median(rows.map((r) => r.resultBytes)),
		meanBatchCalls: mean(rows.map((r) => r.batch.batchCalls)),
		haltedBatches: rows.reduce((a, r) => a + r.batch.haltedBatches, 0),
		costComplete: rows.every((r) => r.costComplete),
	};
}

function groupBy(rows: RunSummary[]): Map<string, RunSummary[]> {
	const map = new Map<string, RunSummary[]>();
	for (const r of rows) {
		const key = `${r.scenario}|${r.condition}`;
		const arr = map.get(key) ?? [];
		arr.push(r);
		map.set(key, arr);
	}
	return map;
}

function pct(n: number): string {
	return `${(n * 100).toFixed(0)}%`;
}

function reduction(baseline: number, value: number): string {
	if (baseline === 0) return "n/a";
	const r = (baseline - value) / baseline;
	const sign = r >= 0 ? "-" : "+";
	return `${sign}${Math.abs(r * 100).toFixed(0)}%`;
}

function fmt(n: number, digits = 0): string {
	return n.toLocaleString("en-US", {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
	});
}

function renderConfigSection(manifest: Manifest, rows: RunSummary[]): string {
	const timedOut = rows.filter((r) => r.timedOut).length;
	const lines = [
		"## Configuration",
		"",
		`- date: ${manifest.date}`,
		`- provider: ${manifest.provider}`,
		`- driver model: ${manifest.driverModel}`,
		`- objective executor model: ${manifest.executorModel ?? "session driver"}`,
		`- thinking: ${manifest.thinking}`,
		`- repetitions per cell: ${manifest.repetitions}`,
		`- pi version: ${manifest.piVersion}`,
		`- commit: ${manifest.commit}`,
		`- total runs: ${rows.length} (${timedOut} timed out)`,
		"",
		"> Pilot-scale sample. Per the benchmark reporting rules, a headline " +
			"speedup claim needs \u226520 reps/cell and separated cold/warm-cache runs. " +
			"Treat small-n medians as directional.",
		"",
	];
	return lines.join("\n");
}

function renderScenarioTable(c: CellStats): string {
	return (
		`| ${c.condition} | ${c.n} | ${pct(c.successRate)} | ` +
		`${fmt(c.medianTurns)} | ${fmt(c.medianToolCalls)} | ${fmt(c.medianActions)} | ` +
		`${c.medianActionCompression.toFixed(2)}x | ` +
		`$${c.medianCost.toFixed(5)} | $${c.medianPlannerCost.toFixed(5)} | $${c.medianTotalCost.toFixed(5)} | ` +
		`${fmt(c.medianResultBytes)} | ${(c.medianElapsedMs / 1000).toFixed(1)} |`
	);
}

function renderReductionTable(baseline: CellStats, c: CellStats): string {
	return (
		`| ${c.condition} | ${reduction(baseline.medianTurns, c.medianTurns)} | ` +
		`${reduction(baseline.medianToolCalls, c.medianToolCalls)} | ` +
		`${reduction(baseline.medianTotalCost, c.medianTotalCost)} | ` +
		`${reduction(baseline.medianResultBytes, c.medianResultBytes)} |`
	);
}

function renderScenarioSection(
	scenario: string,
	conditions: string[],
	cellMap: Map<string, CellStats>,
	rows: RunSummary[],
): string {
	const label = rows.find((r) => r.scenario === scenario)?.scenario ?? scenario;
	const baseline = cellMap.get(`${scenario}|native`);
	const tableRows = ["", `## Scenario ${label}`, ""];
	tableRows.push(
		"| condition | n | success | med turns | med tool calls | med actions | action compression | med cost (USD) | med planner cost (USD) | med total cost (USD) | med result bytes | med latency (s) |",
	);
	tableRows.push(
		"| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
	);

	for (const condition of conditions) {
		const c = cellMap.get(`${scenario}|${condition}`);
		if (c) tableRows.push(renderScenarioTable(c));
	}
	tableRows.push("");

	if (baseline) {
		tableRows.push("Reduction vs native (positive = fewer/cheaper):");
		tableRows.push("");
		tableRows.push("| condition | turns | tool calls | total cost | result bytes |");
		tableRows.push("| --- | --- | --- | --- | --- |");
		for (const condition of conditions) {
			if (condition === "native") continue;
			const c = cellMap.get(`${scenario}|${condition}`);
			if (c) tableRows.push(renderReductionTable(baseline, c));
		}
		tableRows.push("");
	}

	return tableRows.join("\n");
}

function renderAggregateRow(condition: string, rows: RunSummary[]): string {
	const condRows = rows.filter((r) => r.condition === condition);
	if (condRows.length === 0) return "";
	const driverCost = median(condRows.map((r) => r.usage.costUsd));
	const plannerCost = median(condRows.map((r) => r.plannerUsage?.costUsd ?? 0));
	return (
		`| ${condition} | ${pct(mean(condRows.map((r) => (r.verificationPassed ? 1 : 0))))} | ` +
		`${fmt(median(condRows.map((r) => r.modelTurns)))} | ` +
		`${fmt(median(condRows.map((r) => r.toolCalls)))} | ` +
		`$${driverCost.toFixed(5)} | $${plannerCost.toFixed(5)} | $${(driverCost + plannerCost).toFixed(5)} | ` +
		`${fmt(median(condRows.map((r) => r.resultBytes)))} |`
	);
}

function renderAggregateSection(conditions: string[], rows: RunSummary[]): string {
	const lines = [
		"## Aggregate across scenarios",
		"",
		"| condition | success | med turns | med tool calls | driver cost (USD) | planner cost (USD) | total cost (USD) | med result bytes |",
		"| --- | --- | --- | --- | --- | --- | --- | --- |",
	];
	for (const condition of conditions) {
		const row = renderAggregateRow(condition, rows);
		if (row) lines.push(row);
	}
	return lines.join("\n");
}

function renderInterpretation(): string {
	return (
		"## Interpretation\n\n" +
		"The hypothesis under test is that for short dependent repository " +
		"workflows, `batch_queue` reduces model/tool interaction turns and " +
		"context overhead while preserving correctness. Read the per-scenario " +
		"tables above: batch conditions should show fewer model/tool turns " +
		"for dependent work at equal success. Result bytes are reported " +
		"separately because the queue intentionally returns structured action " +
		"evidence and can therefore be larger than terse native output. " +
		"Batch-objective may cost more because planning is an extra " +
		"model-mediated step.\n"
	);
}

function buildReport(
	manifest: Manifest,
	cells: CellStats[],
	rows: RunSummary[],
): string {
	const scenarios = [...new Set(cells.map((c) => c.scenario))];
	const conditions = [...new Set(cells.map((c) => c.condition))];
	const cellMap = new Map(cells.map((c) => [`${c.scenario}|${c.condition}`, c]));

	const sections = [
		"# batched-queue Pi headless benchmark results",
		"",
		"Generated by `benchmarks/harness/aggregate.ts`. Numbers reflect the " +
			"committed queue implementation with no behavioural changes.",
		"",
		renderConfigSection(manifest, rows),
	];

	for (const scenario of scenarios) {
		sections.push(renderScenarioSection(scenario, conditions, cellMap, rows));
	}

	sections.push(renderAggregateSection(conditions, rows));
	sections.push("");
	sections.push(renderInterpretation());

	return `${sections.join("\n")}\n`;
}

function main(): void {
	const dir = process.argv[2];
	if (!dir) {
		console.error("Usage: bun benchmarks/harness/aggregate.ts <results-dir>");
		process.exit(1);
	}
	const rows = JSON.parse(
		readFileSync(join(dir, "runs.json"), "utf8"),
	) as RunSummary[];
	const manifest = JSON.parse(
		readFileSync(join(dir, "manifest.json"), "utf8"),
	) as Manifest;

	const groups = groupBy(rows);
	const cells = [...groups.values()].map(computeCell);

	writeFileSync(
		join(dir, "aggregate.json"),
		`${JSON.stringify(cells, null, 2)}\n`,
	);
	const report = buildReport(manifest, cells, rows);
	writeFileSync(join(dir, "REPORT.md"), report);
	console.error(`Wrote ${join(dir, "aggregate.json")} and REPORT.md`);
	process.stdout.write(report);
}

if (import.meta.main) {
	main();
}
