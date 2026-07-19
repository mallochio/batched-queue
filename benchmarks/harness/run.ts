// Condition runner for the Pi headless benchmark.
//
// Spawns Pi in JSON event mode against a fresh deterministic fixture for every
// (scenario, condition, repetition), records raw JSONL + stderr, parses a
// summary, and writes a manifest. No model behaviour is modified; this measures
// the current implementation.
//
// Usage:
//   bun benchmarks/harness/run.ts \
//     --scenarios H1,H2,H3 --conditions native,batch-explicit,batch-objective \
//     --reps 3 --driver-model gpt-5.4-mini --provider openai --thinking low
//
// Requires a provider API key in the environment (e.g. OPENAI_API_KEY).

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createFixture } from "./fixture.ts";
import { summarizeRun } from "./parse-events.ts";
import { CONDITIONS, SCENARIOS, conditionById, scenarioById } from "./scenarios.ts";
import type { ConditionId, Manifest, RunSummary } from "./types.ts";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");
const EXTENSION = join(REPO_ROOT, "src", "extension.ts");
const PI_BIN = join(REPO_ROOT, "node_modules", ".bin", "pi");

interface CliArgs {
	scenarios: string[];
	conditions: ConditionId[];
	reps: number;
	driverModel: string;
	executorModel: string | null;
	provider: string;
	thinking: string;
	executorThinking: string;
	maxCostUsd: number;
	timeoutMs: number;
	outDir: string;
}

function parseArgs(argv: string[]): CliArgs {
	const map = new Map<string, string>();
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a.startsWith("--")) {
			const key = a.slice(2);
			const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
			map.set(key, val);
		}
	}
	const driverModel = map.get("driver-model") ?? "gpt-5.4-mini";
	const executorModel =
		map.get("executor-model") ?? process.env.BATCH_QUEUE_EXECUTOR ?? "openai/gpt-5.4-nano";
	const date = new Date().toISOString().slice(0, 10);
	const defaultOut = join(
		REPO_ROOT,
		"benchmarks",
		"results",
		`${date}-${driverModel.replace(/[^\w.-]/g, "_")}`,
	);
	return {
		scenarios: (map.get("scenarios") ?? SCENARIOS.map((s) => s.id).join(","))
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean),
		conditions: (
			map.get("conditions") ?? CONDITIONS.map((c) => c.id).join(",")
		)
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean) as ConditionId[],
		reps: Number(map.get("reps") ?? 3),
		driverModel,
		executorModel: executorModel === "none" ? null : executorModel,
		provider: map.get("provider") ?? "openai",
		thinking: map.get("thinking") ?? "low",
		executorThinking: map.get("executor-thinking") ?? "high",
		maxCostUsd: Number(map.get("max-cost-usd") ?? 30),
		timeoutMs: Number(map.get("timeout-ms") ?? 240000),
		outDir: map.get("out") ?? defaultOut,
	};
}

interface PiResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	timedOut: boolean;
	elapsedMs: number;
}

function runPi(
	args: string[],
	cwd: string,
	env: Record<string, string>,
	timeoutMs: number,
): Promise<PiResult> {
	return new Promise((resolvePromise) => {
		const start = Date.now();
		// Pi's CLI requires Bun's runtime here (Node's undici build is incompatible).
		const child = spawn("bun", [PI_BIN, ...args], {
			cwd,
			env: { ...process.env, ...env },
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGKILL");
		}, timeoutMs);
		child.stdout.on("data", (d) => {
			stdout += d.toString();
		});
		child.stderr.on("data", (d) => {
			stderr += d.toString();
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			resolvePromise({
				stdout,
				stderr,
				exitCode: code ?? -1,
				timedOut,
				elapsedMs: Date.now() - start,
			});
		});
	});
}

function shuffle<T>(items: T[]): T[] {
	const arr = [...items];
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

async function getPiVersion(): Promise<string> {
	const r = await runPi(["--version"], REPO_ROOT, {}, 30000);
	return r.stdout.trim() || "unknown";
}

function getCommit(): string {
	try {
		return require("node:child_process")
			.execSync("git rev-parse --short HEAD", { cwd: REPO_ROOT })
			.toString()
			.trim();
	} catch {
		return "unknown";
	}
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));

	if (!existsSync(PI_BIN)) {
		console.error(`Pi CLI not found at ${PI_BIN}. Run \`bun install\` first.`);
		process.exit(1);
	}

	mkdirSync(args.outDir, { recursive: true });

	const piVersion = await getPiVersion();
	const manifest: Manifest = {
		date: new Date().toISOString(),
		driverModel: args.driverModel,
		executorModel: args.executorModel,
		provider: args.provider,
		thinking: args.thinking,
		repetitions: args.reps,
		scenarios: args.scenarios,
		conditions: args.conditions,
		piVersion,
		commit: getCommit(),
	};
	writeFileSync(
		join(args.outDir, "manifest.json"),
		`${JSON.stringify(manifest, null, 2)}\n`,
	);

	// Build a randomized work list to reduce warm-cache/provider drift ordering.
	interface Job {
		scenario: string;
		condition: ConditionId;
		run: number;
	}
	const jobs: Job[] = [];
	for (let run = 1; run <= args.reps; run++) {
		for (const scenario of args.scenarios) {
			for (const condition of args.conditions) {
				jobs.push({ scenario, condition, run });
			}
		}
	}
	const ordered = shuffle(jobs);

	const summaries: RunSummary[] = [];
	let done = 0;
	let observedCostUsd = 0;
	for (const job of ordered) {
		done++;
		const scenario = scenarioById(job.scenario);
		const condition = conditionById(job.condition);
		if (!scenario || !condition) {
			console.error(`Skipping unknown ${job.scenario}/${job.condition}`);
			continue;
		}

		const fixture = createFixture();
		const prompt = `${scenario.task}\n\n${condition.toolInstruction}`;
		const piArgs = [
			"--mode",
			"json",
			"--no-session",
			"--no-context-files",
			"--approve",
			"--provider",
			args.provider,
			"--model",
			args.driverModel,
			"--thinking",
			args.thinking,
			...condition.piArgs.map((a) => (a === "__EXTENSION__" ? EXTENSION : a)),
			prompt,
		];
		const env: Record<string, string> = { ...(condition.env ?? {}) };
		if (condition.id === "batch-objective" && args.executorModel) {
			env.BATCH_QUEUE_EXECUTOR = args.executorModel;
			env.BATCH_QUEUE_EXECUTOR_THINKING = args.executorThinking;
		}

		const tag = `${scenario.id}-${condition.id}-${job.run}`;
		if (observedCostUsd >= args.maxCostUsd) {
			console.error(
				`\nStopping before ${tag}: observed outer cost ` +
					`$${observedCostUsd.toFixed(4)} reached cap $${args.maxCostUsd.toFixed(2)}`,
			);
			break;
		}
		process.stderr.write(
			`[${done}/${ordered.length}] ${tag} ... `,
		);
		const result = await runPi(piArgs, fixture.dir, env, args.timeoutMs);

		writeFileSync(join(args.outDir, `${tag}.jsonl`), result.stdout);
		if (result.stderr.trim()) {
			writeFileSync(join(args.outDir, `${tag}.stderr.log`), result.stderr);
		}

		const summary = summarizeRun({
			scenario: scenario.id,
			condition: condition.id,
			run: job.run,
			model: args.driverModel,
			exitCode: result.exitCode,
			timedOut: result.timedOut,
			elapsedMs: result.elapsedMs,
			jsonl: result.stdout,
			predicate: scenario.predicate,
		});
		writeFileSync(
			join(args.outDir, `${tag}.summary.json`),
			`${JSON.stringify(summary, null, 2)}\n`,
		);
		summaries.push(summary);
		observedCostUsd += summary.usage.costUsd;
		// Persist after every job so an interrupted long run remains resumable.
		writeFileSync(
			join(args.outDir, "runs.json"),
			`${JSON.stringify(summaries, null, 2)}\n`,
		);
		fixture.cleanup();

		process.stderr.write(
			`${summary.verificationPassed ? "PASS" : "FAIL"} ` +
				`turns=${summary.modelTurns} tools=${summary.toolCalls} ` +
				`actions=${summary.actionsCompleted} ` +
				`cost=$${summary.usage.costUsd.toFixed(5)} ` +
				`${(summary.elapsedMs / 1000).toFixed(1)}s\n`,
		);
	}

	writeFileSync(
		join(args.outDir, "runs.json"),
		`${JSON.stringify(summaries, null, 2)}\n`,
	);
	console.error(
		`\nWrote ${summaries.length} run summaries to ${args.outDir}\n` +
			`Next: bun benchmarks/harness/aggregate.ts ${args.outDir}`,
	);
}

if (import.meta.main) {
	main().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
