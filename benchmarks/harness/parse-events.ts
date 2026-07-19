// JSON-event parser for Pi `--mode json` sessions.
//
// Parses one JSON object per line and tolerates unknown future event types.
// Only known numeric usage fields are normalized; the raw stream is never
// assumed to follow one exact schema.

import type {
	BatchActionStats,
	ConditionId,
	RunSummary,
	UsageTotals,
} from "./types.ts";

const BATCH_COUNT_RE = /\((\d+)\/(\d+) actions/;

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

export interface ParsedEvents {
	modelTurns: number;
	toolCalls: number;
	toolBreakdown: Record<string, number>;
	usage: UsageTotals;
	resultBytes: number;
	batch: BatchActionStats;
	reachedAgentEnd: boolean;
	willRetry: boolean;
	/** Concatenated text of all final-transcript assistant messages. */
	finalAssistantText: string;
	haltReason: string | null;
	parseErrors: number;
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
	predicate: (finalText: string) => boolean;
}

export function summarizeRun(input: SummarizeInput): RunSummary {
	const parsed = parseEventStream(input.jsonl);
	const actionsCompleted =
		parsed.batch.batchCalls > 0
			? parsed.batch.completedActions +
				// non-batch tool calls (e.g. an occasional native read) still count
				(parsed.toolCalls - parsed.batch.batchCalls)
			: parsed.toolCalls;
	const actionCompression = actionsCompleted / Math.max(parsed.toolCalls, 1);

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
		resultBytes: parsed.resultBytes,
		verificationPassed:
			parsed.reachedAgentEnd &&
			!parsed.willRetry &&
			input.predicate(parsed.finalAssistantText),
		batch: parsed.batch,
		completed: parsed.reachedAgentEnd && !parsed.willRetry,
		haltReason: parsed.haltReason,
	};
}
