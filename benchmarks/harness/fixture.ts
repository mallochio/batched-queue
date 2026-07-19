// Deterministic fixture-repository generator for the benchmark harness.
//
// The fixture is fully deterministic (no randomness, no network) so runs are
// comparable across conditions. Each repetition gets a fresh copy so no run
// can affect the next. Callers clean up unless KEEP_BENCHMARK_ARTIFACTS=1.

import { mkdtempSync, rmSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

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
				'tok=$(grep -o \'"verifyToken":"[^"]*"\' config/project.json | cut -d\'"\' -f4)',
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
	cleanup: () => void;
}

/** Create a fresh fixture repository in a unique temp directory. */
export function createFixture(): Fixture {
	const dir = mkdtempSync(join(tmpdir(), "bq-fixture-"));
	const hash = createHash("sha256");
	for (const file of fixtureFiles()) {
		const full = join(dir, file.path);
		mkdirSync(join(full, ".."), { recursive: true });
		writeFileSync(full, file.content);
		if (file.executable) chmodSync(full, 0o755);
		hash.update(file.path);
		hash.update(file.content);
	}
	const digest = hash.digest("hex");
	const keep = process.env.KEEP_BENCHMARK_ARTIFACTS === "1";
	return {
		dir,
		digest,
		cleanup: () => {
			if (!keep) rmSync(dir, { recursive: true, force: true });
		},
	};
}
