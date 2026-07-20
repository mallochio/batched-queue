// Normalized planner usage accounting for batched-queue.
//
// The planner may run multiple grounding calls plus a final JSON extraction.
// This module provides a stable accumulator that is forwarded into the tool
// result details so the benchmark harness can separate driver, planner, and
// execution costs.

export interface PlannerUsage {
	/** Provider id, e.g. "openai". */
	readonly provider: string;
	/** Model id used by the planner. */
	readonly model: string;
	/** Number of planner model calls aggregated. */
	readonly calls: number;
	/** Sum of input tokens across planner calls. */
	readonly inputTokens: number;
	/** Sum of output tokens across planner calls. */
	readonly outputTokens: number;
	/** Sum of cache-read tokens across planner calls. */
	readonly cacheReadTokens: number;
	/** Sum of cache-write tokens across planner calls. */
	readonly cacheWriteTokens: number;
	/** Sum of reasoning/thinking tokens, when reported. */
	readonly reasoningTokens: number;
	/** Sum of total tokens across planner calls. */
	readonly totalTokens: number;
	/** Sum of reported cost in USD. */
	readonly costUsd: number;
	/** Raw provider usage object(s) for debugging. */
	readonly raw?: unknown;
}

export interface PlannerUsageAccumulator {
	provider: string;
	model: string;
	calls: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	reasoningTokens: number;
	totalTokens: number;
	costUsd: number;
	raws: unknown[];
}

export function emptyPlannerUsage(
	provider: string,
	model: string,
): PlannerUsageAccumulator {
	return {
		provider,
		model,
		calls: 0,
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		reasoningTokens: 0,
		totalTokens: 0,
		costUsd: 0,
		raws: [],
	};
}

function asNumber(value: unknown): number {
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
}

export function addPlannerUsage(
	acc: PlannerUsageAccumulator,
	raw: unknown,
): void {
	if (!raw || typeof raw !== "object") return;
	const u = raw as Record<string, unknown>;
	acc.calls += 1;
	acc.inputTokens += asNumber(u.input);
	acc.outputTokens += asNumber(u.output);
	acc.cacheReadTokens += asNumber(u.cacheRead);
	acc.cacheWriteTokens += asNumber(u.cacheWrite);
	acc.reasoningTokens += asNumber(u.reasoning);
	acc.totalTokens += asNumber(u.totalTokens);
	const cost = u.cost;
	if (cost && typeof cost === "object") {
		acc.costUsd += asNumber((cost as Record<string, unknown>).total);
	}
	acc.raws.push(raw);
}

export function finalizePlannerUsage(
	acc: PlannerUsageAccumulator,
	keepRaw = true,
): PlannerUsage {
	return {
		provider: acc.provider,
		model: acc.model,
		calls: acc.calls,
		inputTokens: acc.inputTokens,
		outputTokens: acc.outputTokens,
		cacheReadTokens: acc.cacheReadTokens,
		cacheWriteTokens: acc.cacheWriteTokens,
		reasoningTokens: acc.reasoningTokens,
		totalTokens: acc.totalTokens,
		costUsd: acc.costUsd,
		raw: keepRaw ? (acc.raws.length === 1 ? acc.raws[0] : acc.raws) : undefined,
	};
}
