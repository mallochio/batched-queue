/**
 * integration tests for the Milestone 2 queue runner.
 *
 * run: bun test pi-config/extensions/batched-queue/queue-runner.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { BatchQueueRunner } from "../src/queue-runner";
import { PersistentShell } from "../src/persistent-shell";
import { BASH_TIMEOUT_EXIT_CODE } from "../src/constants";

const tmpParent = path.join(path.dirname(fileURLToPath(import.meta.url)), ".tmp");
const realPath = (target: string) => fs.realpathSync(target);

describe("PersistentShell", () => {
	let shell: PersistentShell;
	let tmpDir: string;

	beforeEach(async () => {
		fs.mkdirSync(tmpParent, { recursive: true });
		tmpDir = fs.mkdtempSync(path.join(tmpParent, "bq-shell-"));
		shell = new PersistentShell({ initialCwd: tmpDir });
		await shell.waitUntilReady();
	});

	afterEach(async () => {
		await shell.dispose();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("persists cwd between commands", async () => {
		const subDir = path.join(tmpDir, "nested");
		fs.mkdirSync(subDir);

		const cdResult = await shell.execute(`cd ${subDir}`);
		expect(cdResult.exitCode).toBe(0);
		expect(realPath(cdResult.cwd)).toBe(realPath(subDir));

		const pwdResult = await shell.execute("pwd -P");
		expect(pwdResult.exitCode).toBe(0);
		expect(realPath(pwdResult.stdout.trim())).toBe(realPath(subDir));
	});

	it("persists exported environment variables", async () => {
		await shell.execute("export BQ_TEST_VAR=hello");
		const result = await shell.execute('printf "%s" "$BQ_TEST_VAR"');
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe("hello");
	});

	it("returns non-zero exit codes without throwing", async () => {
		const result = await shell.execute("exit 7");
		expect(result.exitCode).toBe(7);
	});
});

describe("BatchQueueRunner", () => {
	let runner: BatchQueueRunner;
	let tmpDir: string;

	beforeEach(() => {
		fs.mkdirSync(tmpParent, { recursive: true });
		tmpDir = fs.mkdtempSync(path.join(tmpParent, "bq-runner-"));
		runner = new BatchQueueRunner("test-session", tmpDir);
	});

	afterEach(async () => {
		await runner.dispose();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("executes a successful multi-action batch", async () => {
		const filePath = path.join(tmpDir, "sample.txt");
		fs.writeFileSync(filePath, "alpha\nbeta\n gamma\n");

		const result = await runner.executeBatch({
			batchId: "batch-ok",
			actions: [
				{ type: "read_lines", path: "sample.txt", startLine: 1, endLine: 2 },
				{ type: "grep_pattern", pattern: "beta", path: "." },
				{ type: "execute_bash", command: "printf ok" },
			],
		});

		expect(result.haltedPrematurely).toBe(false);
		expect(result.completedCount).toBe(3);
		expect(result.results[0].type).toBe("read_lines");
		expect(result.results[0].success).toBe(true);
		expect(result.results[1].type).toBe("grep_pattern");
		expect(result.results[1].success).toBe(true);
		expect(result.results[2].type).toBe("execute_bash");
		expect(result.results[2].success).toBe(true);
	});

	it("fast-fails on non-zero bash exit and discards remaining actions", async () => {
		const result = await runner.executeBatch({
			actions: [
				{ type: "execute_bash", command: "printf first" },
				{ type: "execute_bash", command: "exit 3" },
				{ type: "execute_bash", command: "printf never-runs" },
			],
		});

		expect(result.haltedPrematurely).toBe(true);
		expect(result.haltReason).toBe("non_zero_exit");
		expect(result.haltedAtIndex).toBe(1);
		expect(result.completedCount).toBe(2);
		expect(result.results[1].exitCode).toBe(3);
		expect(result.results[1].haltReason).toBe("non_zero_exit");
	});

	it("fast-fails on validation errors from apply_diff", async () => {
		fs.writeFileSync(path.join(tmpDir, "edit.me"), "unchanged");

		const result = await runner.executeBatch({
			actions: [
				{
					type: "apply_diff",
					path: "edit.me",
					oldText: "missing",
					newText: "replacement",
				},
				{ type: "execute_bash", command: "printf skipped" },
			],
		});

		expect(result.haltedPrematurely).toBe(true);
		expect(result.haltReason).toBe("validation_failed");
		expect(result.haltedAtIndex).toBe(0);
		expect(result.completedCount).toBe(1);
		expect(result.results[0].type).toBe("apply_diff");
		expect(result.results[0].success).toBe(false);
		expect(result.results[0].haltReason).toBe("validation_failed");
	});

	it("preserves shell cwd across batched bash actions", async () => {
		const nested = path.join(tmpDir, "persist");
		fs.mkdirSync(nested);

		const result = await runner.executeBatch({
			actions: [
				{ type: "execute_bash", command: `cd ${nested}` },
				{ type: "execute_bash", command: "pwd -P" },
			],
		});

		expect(result.haltedPrematurely).toBe(false);
		const pwdResult = result.results[1];
		expect(pwdResult.type).toBe("execute_bash");
		if (pwdResult.type === "execute_bash") {
			expect(realPath(pwdResult.stdout.text.trim())).toBe(realPath(nested));
		}
		expect(realPath(result.shellState.cwd)).toBe(realPath(nested));
	});

	it("fast-fails when read_lines target is missing", async () => {
		const result = await runner.executeBatch({
			actions: [
				{ type: "read_lines", path: "missing.txt" },
				{ type: "execute_bash", command: "printf skipped" },
			],
		});

		expect(result.haltedPrematurely).toBe(true);
		expect(result.haltReason).toBe("action_error");
		expect(result.results[0].haltReason).toBe("action_error");
		expect(result.completedCount).toBe(1);
	});

	it("rejects paths outside the workspace boundary", async () => {
		const result = await runner.executeBatch({
			actions: [{ type: "read_lines", path: "/etc/passwd" }],
		});

		expect(result.haltedPrematurely).toBe(true);
		expect(result.haltReason).toBe("action_error");
		expect(result.results[0].haltReason).toBe("action_error");
		expect(result.results[0].error).toMatch(/not allowed|blocked|outside/i);
	});

	it("recovers the shell after a command timeout", async () => {
		const timeoutRunner = new BatchQueueRunner("timeout-session", tmpDir, {
			defaultCommandTimeoutMs: 100,
		});

		const timedOut = await timeoutRunner.executeBatch({
			actions: [{ type: "execute_bash", command: "sleep 5", timeoutMs: 100 }],
		});

		expect(timedOut.haltedPrematurely).toBe(true);
		expect(timedOut.haltReason).toBe("timeout");
		expect(timedOut.results[0].haltReason).toBe("timeout");
		expect(timedOut.results[0].exitCode).toBe(BASH_TIMEOUT_EXIT_CODE);

		const recovered = await timeoutRunner.executeBatch({
			actions: [{ type: "execute_bash", command: "printf recovered" }],
		});

		expect(recovered.haltedPrematurely).toBe(false);
		const recoveredResult = recovered.results[0];
		expect(recoveredResult.type).toBe("execute_bash");
		if (recoveredResult.type === "execute_bash") {
			expect(recoveredResult.stdout.text.trim()).toBe("recovered");
		}

		await timeoutRunner.dispose();
	});

	it("syncs workspace root when cwd changes", async () => {
		const nested = path.join(tmpDir, "nested");
		fs.mkdirSync(nested);
		fs.writeFileSync(path.join(nested, "local.txt"), "nested content\n");

		runner.syncWorkspaceRoot(nested);

		const result = await runner.executeBatch({
			actions: [{ type: "read_lines", path: "local.txt" }],
		});

		expect(result.haltedPrematurely).toBe(false);
		expect(result.results[0].success).toBe(true);
	});

	it("resets shell cwd when workspace root changes", async () => {
		const nested = path.join(tmpDir, "shell-sync");
		fs.mkdirSync(nested);

		await runner.executeBatch({
			actions: [{ type: "execute_bash", command: "printf in-root" }],
		});

		runner.syncWorkspaceRoot(nested);

		const result = await runner.executeBatch({
			actions: [{ type: "execute_bash", command: "pwd -P" }],
		});

		expect(result.haltedPrematurely).toBe(false);
		const pwdResult = result.results[0];
		expect(pwdResult.type).toBe("execute_bash");
		if (pwdResult.type === "execute_bash") {
			expect(realPath(pwdResult.stdout.text.trim())).toBe(realPath(nested));
		}
		expect(realPath(result.shellState.cwd)).toBe(realPath(nested));
	});
});
