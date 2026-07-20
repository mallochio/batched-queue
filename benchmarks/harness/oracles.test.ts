import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createFixture } from "./fixture.ts";
import { computeDigest, defaultOracle, reverify } from "./oracles.ts";
import type { OracleContext, ParsedEvents } from "./types.ts";

function emptyParsed(finalText = "", bashOutputs: string[] = []): ParsedEvents {
	return {
		modelTurns: 0,
		toolCalls: 0,
		toolBreakdown: {},
		usage: {
			inputTokens: 0,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
			reasoningTokens: 0,
			totalTokens: 0,
			costUsd: 0,
		},
		resultBytes: 0,
		batch: { batchCalls: 0, completedActions: 0, requestedActions: 0, haltedBatches: 0 },
		reachedAgentEnd: true,
		willRetry: false,
		finalAssistantText: finalText,
		bashOutputs,
		haltReason: null,
		parseErrors: 0,
	};
}

async function contextFor(
	scenarioId: string,
	parsed: ParsedEvents,
	fixtureArg?: ReturnType<typeof createFixture>,
): Promise<OracleContext> {
	const fixture = fixtureArg ?? createFixture(scenarioId);
	const expected = JSON.parse(readFileSync(join(fixture.proofDir, "expected.json"), "utf8"));
	return {
		fixtureDir: fixture.dir,
		expected,
		parsed,
		timedOut: false,
		readFixtureFile: (path: string) => {
			try {
				return readFileSync(join(fixture.dir, path), "utf8");
			} catch {
				return null;
			}
		},
		reverify: (command, timeoutMs = 30000) => reverify(fixture.dir, command, timeoutMs),
	};
}

test("reverify runs a command in the fixture directory", async () => {
	const fixture = createFixture("H1");
	const { exitCode, stdout } = await reverify(fixture.dir, "bash scripts/check.sh");
	expect(exitCode).toBe(0);
	expect(stdout).toContain("VERIFY_OK token=VTOK-9C3");
	fixture.cleanup();
});

test("defaultOracle passes for a verify scenario with matching output", async () => {
	const fixture = createFixture("H1");
	const ctx = await contextFor(
		"H1",
		emptyParsed("VERIFY_OK token=VTOK-9C3", ["VERIFY_OK token=VTOK-9C3"]),
		fixture,
	);
	const result = await defaultOracle(ctx);
	expect(result.passed).toBe(true);
	expect(result.checks["reverify:VERIFY_OK token=VTOK-9C3"]).toBe(true);
	expect(result.checks["expected:VERIFY_OK"]).toBe(true);
	fixture.cleanup();
});

test("defaultOracle fails when expected output is missing", async () => {
	const fixture = createFixture("H1");
	const ctx = await contextFor("H1", emptyParsed("wrong answer"), fixture);
	const result = await defaultOracle(ctx);
	expect(result.passed).toBe(false);
	expect(result.checks["expected:VERIFY_OK"]).toBe(false);
	fixture.cleanup();
});

test("defaultOracle passes for a failure scenario with halted batch", async () => {
	const fixture = createFixture("H4");
	const ctx = await contextFor(
		"H4",
		emptyParsed("the check failed and the trailing step was skipped", ["about to fail"]),
		fixture,
	);
	const result = await defaultOracle(ctx);
	expect(result.passed).toBe(true);
	expect(result.checks["reverify:exitCode"]).toBe(true);
	expect(result.checks["forbidden:VERIFY_OK"]).toBe(true);
	fixture.cleanup();
});

test("defaultOracle detects forbidden output in failure scenario", async () => {
	const fixture = createFixture("H4");
	const ctx = await contextFor(
		"H4",
		emptyParsed("failed and skipped", ["VERIFY_OK token=VTOK-9C3"]),
		fixture,
	);
	const result = await defaultOracle(ctx);
	expect(result.passed).toBe(false);
	expect(result.checks["forbidden:VERIFY_OK"]).toBe(false);
	fixture.cleanup();
});

test("computeDigest detects fixture mutation", async () => {
	const fixture = createFixture("H23");
	const before = computeDigest(fixture.dir, [".bench/proof"]);
	const expected = fixture.digest;
	expect(before).toBe(expected);

	writeFileSync(join(fixture.dir, "README.md"), "# mutated\n");
	const after = computeDigest(fixture.dir, [".bench/proof"]);
	expect(after).not.toBe(expected);
	fixture.cleanup();
});

test("defaultOracle detects mutation for H23", async () => {
	const fixture = createFixture("H23");
	const ctx = await contextFor(
		"H23",
		emptyParsed("VERIFY_OK", ["VERIFY_OK token=VTOK-9C3"]),
		fixture,
	);
	const passing = await defaultOracle(ctx);
	expect(passing.passed).toBe(true);
	expect(passing.checks["noMutation"]).toBe(true);

	writeFileSync(join(fixture.dir, "README.md"), "# mutated\n");
	const mutated = await defaultOracle(ctx);
	expect(mutated.passed).toBe(false);
	expect(mutated.checks["noMutation"]).toBe(false);
	fixture.cleanup();
});
