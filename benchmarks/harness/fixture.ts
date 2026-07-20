// Deterministic fixture-repository generator for the benchmark harness.
//
// The fixture is fully deterministic (no randomness, no network) so runs are
// comparable across conditions. Each repetition gets a fresh copy so no run
// can affect the next. Callers clean up unless KEEP_BENCHMARK_ARTIFACTS=1.

import { mkdtempSync, rmSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { ProofSpec } from "./oracles.ts";

// Stable markers the model can only report by actually performing the steps.
export const MARKERS = {
	/** Token stored in config/project.json, surfaced by scripts/check.sh. */
	verifyToken: "VTOK-9C3",
	/** Marker printed by scripts/check.sh on success. */
	verifyOk: "VERIFY_OK",
	/** Value stored in nested/state.txt for the binding scenario. */
	benchMarker: "MARK-4F2A",
	/** Persistent-shell env value. */
	shellVar: "STATE-88",
} as const;

interface FixtureFile {
	path: string;
	content: string;
	executable?: boolean;
}

function fixtureFiles(): FixtureFile[] {
	return [
		{
			path: "README.md",
			content:
				"# fixture\n\nDeterministic benchmark fixture for batched-queue.\n",
		},
		{
			path: "config/project.json",
			content: `${JSON.stringify(
				{ name: "fixture", verifyToken: MARKERS.verifyToken, version: 1 },
				null,
				2,
			)}\n`,
		},
		{
			path: "src/config-loader.ts",
			content: [
				'import config from "../config/project.json";',
				"",
				"export interface ProjectConfig {",
				"\tname: string;",
				"\tverifyToken: string;",
				"\tversion: number;",
				"}",
				"",
				"export function loadConfig(): ProjectConfig {",
				"\treturn config as ProjectConfig;",
				"}",
				"",
				"export function verifyToken(): string {",
				"\treturn loadConfig().verifyToken;",
				"}",
				"",
			].join("\n"),
		},
		{
			path: "src/feature.ts",
			content: [
				'import { verifyToken } from "./config-loader.ts";',
				"",
				"export function describe(): string {",
				"\treturn `feature using ${verifyToken()}`;",
				"}",
				"",
			].join("\n"),
		},
		{
			path: "tests/config-loader.test.ts",
			content: [
				'import { expect, test } from "bun:test";',
				'import { verifyToken } from "../src/config-loader.ts";',
				"",
				'test("verifyToken", () => {',
				`\texpect(verifyToken()).toBe("${MARKERS.verifyToken}");`,
				"});",
				"",
			].join("\n"),
		},
		{
			path: "nested/state.txt",
			content: `BENCH_MARKER=${MARKERS.benchMarker}\n`,
		},
		{
			// Focused check for H1: prints VERIFY_OK plus the token read from config.
			path: "scripts/check.sh",
			executable: true,
			content: [
				"#!/usr/bin/env bash",
				"set -euo pipefail",
				'tok=$(grep -o \'"verifyToken": "[^"]*"\' config/project.json | cut -d\'"\' -f4)',
				'echo "VERIFY_OK token=${tok}"',
				"",
			].join("\n"),
		},
		{
			// Deliberate failing check for the fast-fail scenario.
			path: "scripts/fail.sh",
			executable: true,
			content: [
				"#!/usr/bin/env bash",
				'echo "about to fail"',
				"exit 3",
				"",
			].join("\n"),
		},
	];
}

export interface Fixture {
	dir: string;
	digest: string;
	proofDir: string;
	cleanup: () => void;
}

function proofDirFor(dir: string): string {
	return join(dir, ".bench", "proof");
}

export const SCENARIO_PROOFS: Record<string, ProofSpec> = {
	H1: {
		family: "verify",
		expectedSubstrings: [MARKERS.verifyOk, MARKERS.verifyToken],
		reverifyCommand: "bash scripts/check.sh",
		reverifyOutputContains: ["VERIFY_OK token=VTOK-9C3"],
	},
	H2: {
		family: "shell",
		expectedSubstrings: [MARKERS.shellVar, "nested"],
		reverifyCommand: "cd nested && BQ_VAR=STATE-88 && pwd | sed 's|.*/||' && echo $BQ_VAR",
		reverifyOutputContains: ["nested", "STATE-88"],
	},
	H3: {
		family: "binding",
		expectedSubstrings: [`consumed:${MARKERS.benchMarker}`],
		reverifyCommand: "cd nested && marker=$(sed 's/BENCH_MARKER=//' state.txt) && echo consumed:$marker",
		reverifyOutputContains: [`consumed:${MARKERS.benchMarker}`],
	},
	H4: {
		family: "failure",
		expectedSubstrings: ["fail", "skip"],
		reverifyCommand: "bash scripts/fail.sh",
		expectedExitCode: 3,
		reverifyOutputContains: ["fail"],
		forbiddenOutput: ["VERIFY_OK"],
	},
	H5: {
		family: "readonly",
		expectedSubstrings: ["# fixture"],
		reverifyCommand: "head -1 README.md",
		reverifyOutputContains: ["# fixture"],
	},
	H6: {
		family: "readonly",
		expectedSubstrings: ["verifyToken"],
		reverifyCommand: "grep -n verifyToken src/config-loader.ts",
		reverifyOutputContains: ["verifyToken"],
	},
	H7: {
		family: "verify",
		expectedSubstrings: [MARKERS.verifyOk, MARKERS.verifyToken],
		reverifyCommand: "bash scripts/check.sh",
		reverifyOutputContains: ["VERIFY_OK token=VTOK-9C3"],
	},
	H8: {
		family: "shell+verify",
		expectedSubstrings: [MARKERS.shellVar, MARKERS.verifyOk, MARKERS.verifyToken],
		reverifyCommand: "cd nested && BQ_VAR=STATE-88 && pwd | sed 's|.*/||' && echo $BQ_VAR && bash scripts/check.sh",
		reverifyOutputContains: ["nested", "STATE-88", "VERIFY_OK token=VTOK-9C3"],
	},
	H9: {
		family: "readonly",
		expectedSubstrings: ["# fixture", MARKERS.benchMarker, MARKERS.verifyToken],
		reverifyCommand: `printf '%s\\n%s\\n%s\\n' "$(head -1 README.md)" "$(sed 's/BENCH_MARKER=//' nested/state.txt)" "$(grep -o '"verifyToken": "[^"]*"' config/project.json | cut -d'"' -f4)"`,
		reverifyOutputContains: ["# fixture", MARKERS.benchMarker, MARKERS.verifyToken],
	},
	H10: {
		family: "binding+verify",
		expectedSubstrings: [`consumed:${MARKERS.benchMarker}`, MARKERS.verifyOk],
		reverifyCommand: "cd nested && marker=$(sed 's/BENCH_MARKER=//' state.txt) && echo consumed:$marker && bash scripts/check.sh",
		reverifyOutputContains: [`consumed:${MARKERS.benchMarker}`, "VERIFY_OK token=VTOK-9C3"],
	},
	H11: {
		family: "test",
		expectedSubstrings: ["pass", "passed"],
		reverifyCommand: "bun test tests/config-loader.test.ts",
		expectedExitCode: 0,
		reverifyOutputContains: ["pass"],
	},
	H12: {
		family: "failure",
		expectedSubstrings: ["fail", "skip"],
		reverifyCommand: "bash scripts/fail.sh",
		expectedExitCode: 3,
		reverifyOutputContains: ["fail"],
		forbiddenOutput: ["VERIFY_OK"],
	},
	H13: {
		family: "readonly",
		expectedSubstrings: [MARKERS.verifyToken],
		reverifyCommand: `grep -o '"verifyToken": "[^"]*"' config/project.json | cut -d'"' -f4`,
		reverifyOutputContains: [MARKERS.verifyToken],
	},
	H14: {
		family: "readonly",
		expectedSubstrings: ["verifyToken"],
		reverifyCommand: "grep import src/feature.ts",
		reverifyOutputContains: ["verifyToken"],
	},
	H15: {
		family: "test",
		expectedSubstrings: ["pass", "passed"],
		reverifyCommand: "bun test tests/config-loader.test.ts",
		expectedExitCode: 0,
		reverifyOutputContains: ["pass"],
	},
	H16: {
		family: "readonly",
		expectedSubstrings: ["# fixture", "fixture", MARKERS.verifyToken],
		reverifyCommand: `printf '%s\\n%s\\n' "$(head -1 README.md)" "$(grep -o '"verifyToken": "[^"]*"' config/project.json | cut -d'"' -f4)"`,
		reverifyOutputContains: ["# fixture", MARKERS.verifyToken],
	},
	H17: {
		family: "readonly",
		expectedSubstrings: [MARKERS.benchMarker, "bq-fixture"],
		reverifyCommand: "sed 's/BENCH_MARKER=//' nested/state.txt",
		reverifyOutputContains: [MARKERS.benchMarker],
	},
	H18: {
		family: "shell",
		expectedSubstrings: [MARKERS.shellVar, "nested"],
		reverifyCommand: "cd nested && BQ_VAR=STATE-88 && pwd | sed 's|.*/||' && echo $BQ_VAR",
		reverifyOutputContains: ["nested", "STATE-88"],
	},
	H19: {
		family: "binding",
		expectedSubstrings: [`consumed:${MARKERS.benchMarker}`],
		reverifyCommand: "cd nested && marker=$(sed 's/BENCH_MARKER=//' state.txt) && echo consumed:$marker",
		reverifyOutputContains: [`consumed:${MARKERS.benchMarker}`],
	},
	H20: {
		family: "verify",
		expectedSubstrings: [MARKERS.verifyOk, MARKERS.verifyToken],
		reverifyCommand: "bash scripts/check.sh",
		reverifyOutputContains: ["VERIFY_OK token=VTOK-9C3"],
	},
	H21: {
		family: "failure",
		expectedSubstrings: ["fail", "nonzero"],
		reverifyCommand: "bash scripts/fail.sh",
		expectedExitCode: 3,
		reverifyOutputContains: ["fail"],
		forbiddenOutput: ["VERIFY_OK"],
	},
	H22: {
		family: "readonly",
		expectedSubstrings: ["# fixture", MARKERS.verifyToken, "verifyToken", MARKERS.benchMarker],
		reverifyCommand: `printf '%s\\n%s\\n%s\\n%s\\n' "$(head -1 README.md)" "$(grep -o '"verifyToken": "[^"]*"' config/project.json | cut -d'"' -f4)" "$(grep import src/feature.ts)" "$(sed 's/BENCH_MARKER=//' nested/state.txt)"`,
		reverifyOutputContains: ["# fixture", MARKERS.verifyToken, "verifyToken", MARKERS.benchMarker],
	},
	H23: {
		family: "verify+nomutation",
		expectedSubstrings: [MARKERS.verifyOk],
		reverifyCommand: "bash scripts/check.sh",
		reverifyOutputContains: ["VERIFY_OK token=VTOK-9C3"],
		noMutation: true,
	},
	H24: {
		family: "readonly",
		expectedSubstrings: ["version", "loadConfig"],
		reverifyCommand: `printf '%s\\n%s\\n' "$(grep '"version"' config/project.json)" "$(grep loadConfig src/config-loader.ts)"`,
		reverifyOutputContains: ["version", "loadConfig"],
	},
};

/** Create a fresh fixture repository in a unique temp directory. */
export function createFixture(scenarioId = "H1"): Fixture {
	const dir = mkdtempSync(join(tmpdir(), "bq-fixture-"));
	const hash = createHash("sha256");
	const files = fixtureFiles();
	for (const file of files) {
		const full = join(dir, file.path);
		mkdirSync(join(full, ".."), { recursive: true });
		writeFileSync(full, file.content);
		if (file.executable) chmodSync(full, 0o755);
	}
	// Compute the digest from a stable, sorted walk so re-checks are order independent.
	for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
		hash.update(file.path);
		hash.update(file.content);
	}
	const digest = hash.digest("hex");

	// Proof files are excluded from the tracked fixture digest.
	const proofDir = proofDirFor(dir);
	mkdirSync(proofDir, { recursive: true });
	const proof = SCENARIO_PROOFS[scenarioId] ?? { family: "unknown" };
	writeFileSync(
		join(proofDir, "expected.json"),
		`${JSON.stringify({ scenario: scenarioId, family: proof.family, proof }, null, 2)}\n`,
	);
	writeFileSync(join(proofDir, ".digest"), digest);

	const keep = process.env.KEEP_BENCHMARK_ARTIFACTS === "1";
	return {
		dir,
		digest,
		proofDir,
		cleanup: () => {
			if (!keep) rmSync(dir, { recursive: true, force: true });
		},
	};
}
