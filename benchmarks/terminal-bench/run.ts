#!/usr/bin/env bun
/**
 * Terminal-Bench Core v0.1.1 adapter scaffold.
 *
 * Usage:
 *   bun run benchmarks/terminal-bench/run.ts --validate
 *   bun run benchmarks/terminal-bench/run.ts --dry-run
 *
 * The scaffold never executes paid tasks. It only validates adapter parity and
 * prints a manifest.
 */

import {
	adaptersAreParityChecked,
	createTerminalBenchAdapter,
	loadTerminalBenchTasks,
} from "./adapter.ts";
import type { TerminalBenchManifest } from "./types.ts";

const DATASET_PATH = "benchmarks/terminal-bench/dataset.jsonl";
const TERMINAL_BENCH_VERSION = "0.1.1";
const DATASET_VERSION = "unknown";
const PI_VERSION = "pi";

function buildManifest(
	taskIds: readonly string[],
	split: TerminalBenchManifest["split"],
): TerminalBenchManifest {
	return {
		terminalBenchVersion: TERMINAL_BENCH_VERSION,
		datasetVersion: DATASET_VERSION,
		taskCount: taskIds.length,
		taskIds,
		split,
		adapterCommit: "local",
		piVersion: PI_VERSION,
		model: "unknown",
		provider: "unknown",
		timeoutMs: 120_000,
		concurrency: 1,
		budgetUsdPerSession: 0,
	};
}

function printManifest(manifest: TerminalBenchManifest): void {
	console.log("Terminal-Bench manifest:");
	console.log(JSON.stringify(manifest, null, 2));
}

const args = process.argv.slice(2);

const native = createTerminalBenchAdapter("native");
const batch = createTerminalBenchAdapter("batch");

if (!adaptersAreParityChecked(native, batch)) {
	console.error("Adapter parity check failed");
	console.error("native tools:", native.tools.join(", "));
	console.error("batch tools:", batch.tools.join(", "));
	process.exit(1);
}

if (args.includes("--validate")) {
	console.log("OK: native and batch adapters differ only by `batch_queue`");
	process.exit(0);
}

if (args.includes("--dry-run") || args.length === 0) {
	const tasks = loadTerminalBenchTasks(DATASET_PATH);
	const manifest = buildManifest(
		tasks.map((t) => t.id),
		tasks.length === 0 ? "pilot" : "held-out",
	);
	printManifest(manifest);
	console.log(`\nDry-run: ${tasks.length} tasks loaded (none executed).`);
	console.log("Set a non-zero budgetUsdPerSession and provide a dataset to execute.");
	process.exit(0);
}

console.error(`Unknown arguments: ${args.join(" ")}`);
console.error("Usage: --validate | --dry-run");
process.exit(1);
