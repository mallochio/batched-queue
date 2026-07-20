// Fixture-owned oracles for the batched-queue benchmark harness.
//
// Oracles read hidden proof files under .bench/proof/ and run deterministic
// re-verification commands in the fixture directory. They do not decide
// correctness from the final assistant message alone.

import { createHash } from "node:crypto";
import { exec } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { FixtureExpectations, OracleContext, OracleResult } from "./types.ts";

export interface ProofSpec {
	/** Scenario family for runbook reporting. */
	family: string;
	/** Substrings that must appear in the final text or any bash/batch output. */
	expectedSubstrings?: string[];
	/** Bash command to re-run in the fixture directory (side-effect bounded). */
	reverifyCommand?: string;
	/** Expected exit code for reverifyCommand; defaults to 0. */
	expectedExitCode?: number;
	/** Substrings that must appear in the reverify command output. */
	reverifyOutputContains?: string[];
	/** Substrings that must not appear in any bash/batch output. */
	forbiddenOutput?: string[];
	/** Whether the fixture must remain byte-for-byte unchanged (ignoring .bench/proof). */
	noMutation?: boolean;
}

function normalize(text: string): string {
	return text.toLowerCase().replace(/[\s`*_]+/g, "");
}

function contains(text: string, needle: string): boolean {
	return normalize(text).includes(normalize(needle));
}

function anyContains(outputs: readonly string[], needle: string): boolean {
	return outputs.some((o) => contains(o, needle));
}

export function reverify(
	fixtureDir: string,
	command: string,
	timeoutMs = 30000,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = exec(
			command,
			{ cwd: fixtureDir, timeout: timeoutMs, killSignal: "SIGKILL" },
			(error, stdout, stderr) => {
				if (error && error.killed) {
					reject(new Error(`reverify timed out: ${command}`));
					return;
				}
				resolve({
					exitCode: error?.code ? Number(error.code) : 0,
					stdout: stdout.toString(),
					stderr: stderr.toString(),
				});
			},
		);
		// Defensive fallback in case the timeout option is ignored.
		setTimeout(() => child.kill("SIGKILL"), timeoutMs + 1000);
	});
}

function shouldIgnore(entry: string, ignored: readonly string[]): boolean {
	return ignored.some((name) => entry === name || entry.startsWith(`${name}/`));
}

export function computeDigest(
	fixtureDir: string,
	ignoredDirs: readonly string[] = [".bench/proof"],
): string {
	const hash = createHash("sha256");
	function walk(dir: string) {
		const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
			a.name.localeCompare(b.name),
		);
		for (const entry of entries) {
			const full = join(dir, entry.name);
			const rel = relative(fixtureDir, full);
			if (shouldIgnore(rel, ignoredDirs)) continue;
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.isFile()) {
				hash.update(rel);
				hash.update(readFileSync(full));
			}
		}
	}
	walk(fixtureDir);
	return hash.digest("hex");
}

export async function defaultOracle(ctx: OracleContext): Promise<OracleResult> {
	const proof = ctx.expected.proof as ProofSpec | undefined;
	if (!proof) {
		return { passed: false, checks: { proof: false }, note: "missing proof spec" };
	}

	const checks: Record<string, boolean> = {};
	const outputs = [ctx.parsed.finalAssistantText, ...ctx.parsed.bashOutputs];
	let note = "";

	if (proof.expectedSubstrings) {
		for (const sub of proof.expectedSubstrings) {
			checks[`expected:${sub}`] = outputs.some((o) => contains(o, sub));
		}
	}

	if (proof.forbiddenOutput) {
		for (const sub of proof.forbiddenOutput) {
			checks[`forbidden:${sub}`] = !ctx.parsed.bashOutputs.some((o) =>
				contains(o, sub),
			);
		}
	}

	if (proof.reverifyCommand) {
		const { exitCode, stdout, stderr } = await ctx.reverify(
			proof.reverifyCommand,
			30000,
		);
		const expectedExit = proof.expectedExitCode ?? 0;
		checks["reverify:exitCode"] = exitCode === expectedExit;

		const output = stdout + stderr;
		const required = proof.reverifyOutputContains ?? proof.expectedSubstrings ?? [];
		for (const sub of required) {
			checks[`reverify:${sub}`] = contains(output, sub);
		}
	}

	if (proof.noMutation) {
		const expectedDigest = ctx.readFixtureFile(".bench/proof/.digest");
		const actualDigest = computeDigest(ctx.fixtureDir, [".bench/proof"]);
		checks["noMutation"] = expectedDigest === actualDigest;
		if (!checks["noMutation"]) {
			note += "fixture mutated; ";
		}
	}

	const passed = Object.values(checks).every(Boolean);
	return { passed, checks, note: note || undefined };
}
