// JSON-event parser for Pi `--mode json` sessions.
//
// Parses one JSON object per line and tolerates unknown future event types.
// Only known numeric usage fields are normalized; the raw stream is never
// assumed to follow one exact schema.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultOracle, reverify } from "./oracles.ts";
import type {
	BatchActionStats,
	ConditionId,
	OracleContext,
	OracleResult,
	Outcome,
	ParsedEvents,
	PlannerUsageSummary,
	RunSummary,
	UsageTotals,
} from "./types.ts";

const BATCH_COUNT_RE = /\((\d+)\/(\d+) actions/;

function asNumber(value: unknown): number {
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function plannerUsageFromDetails(details: unknown): PlannerUsageSummary | undefined {
	if (!isObject(details)) return undefined;
	const raw = details.plannerUsage;
	if (!isObject(raw)) return undefined;
	const inputTokens = asNumber(raw.inputTokens ?? raw.input);
	const outputTokens = asNumber(raw.outputTokens ?? raw.output);
	const cacheReadTokens = asNumber(raw.cacheReadTokens ?? raw.cacheRead);
	const cacheWriteTokens = asNumber(raw.cacheWriteTokens ?? raw.cacheWrite);
	const reasoningTokens = asNumber(raw.reasoningTokens ?? raw.reasoning);
	const totalTokens = asNumber(raw.totalTokens ?? raw.totalTokens);
	const costUsd = asNumber(raw.costUsd ?? (isObject(raw.cost) ? raw.cost.total : undefined));
	const calls = asNumber(raw.calls);
	if (calls === 0 && totalTokens === 0) return undefined;
	const provider = String(raw.provider ?? "unknown");
	const model = String(raw.model ?? "unknown");
	const costComplete = costUsd > 0 || totalTokens === 0;
	return {
		provider,
		model,
		calls,
		inputTokens,
		outputTokens,
		cacheReadTokens,
		cacheWriteTokens,
		reasoningTokens,
		totalTokens,
		costUsd,
		costComplete,
	};
}

function addPlannerSummary(
	acc: PlannerUsageSummary,
	next: PlannerUsageSummary,
): PlannerUsageSummary {
	return {
		provider: acc.provider,
		model: acc.model,
		calls: acc.calls + next.calls,
		inputTokens: acc.inputTokens + next.inputTokens,
		outputTokens: acc.outputTokens + next.outputTokens,
		cacheReadTokens: acc.cacheReadTokens + next.cacheReadTokens,
		cacheWriteTokens: acc.cacheWriteTokens + next.cacheWriteTokens,
		reasoningTokens: acc.reasoningTokens + next.reasoningTokens,
		totalTokens: acc.totalTokens + next.totalTokens,
		costUsd: acc.costUsd + next.costUsd,
		costComplete: acc.costComplete && next.costComplete,
	};
}

interface RawUsage {
	input?: number;
	output?: number;
	cacheRead?: number;
	cacheWrite?: number;
	reasoning?: number;
	totalTokens?: number;
	cost?: { total?: number };
}

function emptyUsage(): UsageTotals {
	return {
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		reasoningTokens: 0,
		totalTokens: 0,
		costUsd: 0,
	};
}

function addUsage(acc: UsageTotals, raw: RawUsage | undefined): void {
	if (!raw || typeof raw !== "object") return;
	acc.inputTokens += raw.input ?? 0;
	acc.outputTokens += raw.output ?? 0;
	acc.cacheReadTokens += raw.cacheRead ?? 0;
	acc.cacheWriteTokens += raw.cacheWrite ?? 0;
	acc.reasoningTokens += raw.reasoning ?? 0;
	acc.totalTokens += raw.totalTokens ?? 0;
	acc.costUsd += raw.cost?.total ?? 0;
}

/** Extract concatenated text content from a message-like object. */
function textOf(message: unknown): string {
	if (!message || typeof message !== "object") return "";
	const content = (message as { content?: unknown }).content;
	if (!Array.isArray(content)) return "";
	return content
		.filter(
			(c): c is { type: string; text: string } =>
				!!c &&
				typeof c === "object" &&
				(c as { type?: unknown }).type === "text" &&
				typeof (c as { text?: unknown }).text === "string",
		)
		.map((c) => c.text)
		.join("\n");
}

function byteLength(text: string): number {
	return Buffer.byteLength(text, "utf8");
}

export function parseEventStream(jsonl: string): ParsedEvents {
	const usage = emptyUsage();
	const toolBreakdown: Record<string, number> = {};
	const batch: BatchActionStats = {
		batchCalls: 0,
		completedActions: 0,
		requestedActions: 0,
		haltedBatches: 0,
	};

	let modelTurns = 0;
	let toolCalls = 0;
	let resultBytes = 0;
	let reachedAgentEnd = false;
	let willRetry = false;
	let finalAssistantText = "";
	const bashOutputs: string[] = [];
	let plannerUsage: PlannerUsageSummary | undefined;
	let haltReason: string | null = null;
	let parseErrors = 0;

	for (const line of jsonl.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		let obj: Record<string, unknown>;
		try {
			obj = JSON.parse(trimmed) as Record<string, unknown>;
		} catch {
			parseErrors++;
			continue;
		}

		switch (obj.type) {
			case "turn_start":
				modelTurns++;
				break;

			case "tool_execution_start": {
				toolCalls++;
				const name = String(obj.toolName ?? "unknown");
				toolBreakdown[name] = (toolBreakdown[name] ?? 0) + 1;
				break;
			}

			case "tool_execution_end": {
				const name = String(obj.toolName ?? "unknown");
				const resultText = textOf(obj.result);
				resultBytes += byteLength(resultText);
				if (name === "execute_bash" || name === "batch_queue") {
					bashOutputs.push(resultText);
				}
				if (name === "batch_queue") {
					batch.batchCalls++;
					const m = resultText.match(BATCH_COUNT_RE);
					if (m) {
						batch.completedActions += Number(m[1]);
						batch.requestedActions += Number(m[2]);
					}
					if (
						resultText.includes("batch halted") ||
						(obj.isError === true && resultText.length > 0)
					) {
						batch.haltedBatches++;
						const halt = resultText.match(/halted at action \d+ \(([^)]*)\)/);
						if (halt) haltReason = halt[1];
					}
					const details = (obj.result as { details?: unknown })?.details;
					const usage = plannerUsageFromDetails(details);
					if (usage) {
						plannerUsage = plannerUsage ? addPlannerSummary(plannerUsage, usage) : usage;
					}
				}
				break;
			}

			case "agent_end": {
				reachedAgentEnd = true;
				willRetry = obj.willRetry === true;
				const messages = obj.messages;
				if (Array.isArray(messages)) {
					const assistantTexts: string[] = [];
					for (const msg of messages) {
						if (!msg || typeof msg !== "object") continue;
						const role = (msg as { role?: unknown }).role;
						if (role !== "assistant") continue;
						addUsage(usage, (msg as { usage?: RawUsage }).usage);
						const t = textOf(msg);
						if (t) assistantTexts.push(t);
					}
					// Keep the last assistant text block as the final answer, but
					// also retain the full concatenation for predicate matching.
					finalAssistantText = assistantTexts.join("\n");
				}
				break;
			}

			default:
				break;
		}
	}

	return {
		modelTurns,
		toolCalls,
		toolBreakdown,
		usage,
		resultBytes,
		batch,
		reachedAgentEnd,
		willRetry,
		finalAssistantText,
		bashOutputs,
		plannerUsage,
		haltReason,
		parseErrors,
	};
}

export interface SummarizeInput {
	scenario: string;
	condition: ConditionId;
	run: number;
	model: string;
	exitCode: number;
	timedOut: boolean;
	elapsedMs: number;
	jsonl: string;
	/**
	 * Deprecated transcript predicate. Used only when no oracle/fixtureDir is
	 * supplied.
	 */
	predicate?: (finalText: string) => boolean;
	/** Fixture directory containing .bench/proof/ artifacts. */
	fixtureDir?: string;
	/** Fixture-owned oracle; takes precedence over predicate. */
	oracle?: (ctx: OracleContext) => Promise<OracleResult> | OracleResult;
}

function readFixtureFile(fixtureDir: string | undefined, path: string): string | null {
	if (!fixtureDir) return null;
	try {
		return readFileSync(join(fixtureDir, path), "utf8");
	} catch {
		return null;
	}
}

function classifyOutcome(
	parsed: ParsedEvents,
	timedOut: boolean,
	verificationPassed: boolean,
): Outcome {
	if (timedOut) return "timeout";
	if (!parsed.reachedAgentEnd) return "provider_error";
	if (parsed.willRetry) return "invalid";
	return verificationPassed ? "pass" : "fail";
}

function isCostComplete(usage: UsageTotals): boolean {
	return usage.costUsd > 0 || usage.totalTokens === 0;
}

function deriveCostComplete(
	driver: UsageTotals,
	planner?: PlannerUsageSummary,
): boolean {
	const driverComplete = isCostComplete(driver);
	const plannerComplete = !planner || planner.costComplete;
	return driverComplete && plannerComplete;
}

export async function summarizeRun(input: SummarizeInput): Promise<RunSummary> {
	const parsed = parseEventStream(input.jsonl);
	const actionsCompleted =
		parsed.batch.batchCalls > 0
			? parsed.batch.completedActions +
				// non-batch tool calls (e.g. an occasional native read) still count
				(parsed.toolCalls - parsed.batch.batchCalls)
			: parsed.toolCalls;
	const actionCompression = actionsCompleted / Math.max(parsed.toolCalls, 1);

	let verificationPassed = false;
	let oracleResult: OracleResult | undefined;

	if (input.oracle && input.fixtureDir) {
		const expectedRaw = readFixtureFile(input.fixtureDir, ".bench/proof/expected.json");
		const expected = expectedRaw
			? (JSON.parse(expectedRaw) as { scenario: string; family: string; proof: Record<string, unknown> })
			: { scenario: input.scenario, family: "unknown", proof: {} };
		const ctx: OracleContext = {
			fixtureDir: input.fixtureDir,
			expected,
			parsed,
			timedOut: input.timedOut,
			readFixtureFile: (path) => readFixtureFile(input.fixtureDir, path),
			reverify: (command, timeoutMs = 30000) => reverify(input.fixtureDir!, command, timeoutMs),
		};
		oracleResult = await input.oracle(ctx);
		verificationPassed = oracleResult.passed;
	} else if (input.predicate) {
		verificationPassed =
			parsed.reachedAgentEnd &&
			!parsed.willRetry &&
			input.predicate(parsed.finalAssistantText);
	}

	return {
		scenario: input.scenario,
		condition: input.condition,
		run: input.run,
		model: input.model,
		exitCode: input.exitCode,
		timedOut: input.timedOut,
		elapsedMs: input.elapsedMs,
		modelTurns: parsed.modelTurns,
		toolCalls: parsed.toolCalls,
		toolBreakdown: parsed.toolBreakdown,
		actionsCompleted,
		actionCompression,
		usage: parsed.usage,
		plannerUsage: parsed.plannerUsage,
		costComplete: deriveCostComplete(parsed.usage, parsed.plannerUsage),
		resultBytes: parsed.resultBytes,
		verificationPassed,
		batch: parsed.batch,
		completed: parsed.reachedAgentEnd && !parsed.willRetry,
		outcome: classifyOutcome(parsed, input.timedOut, verificationPassed),
		oracle: oracleResult,
		haltReason: parsed.haltReason,
	};
}
