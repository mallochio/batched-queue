/**
 * Permission gate tests for execute_bash.
 *
 * Isolated in its own file because bun hoists mock.module() to file scope.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PersistentShell } from "./persistent-shell";
import { executeBashCommand } from "./executors/execute-bash";

mock.module("./lib/permissions", () => ({
	evaluatePermissionAsync: async () => ({
		action: "reject",
		message: "blocked by test rule",
	}),
	loadPermissions: () => [],
}));

describe("execute_bash permission gate", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bq-perm-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("rejects commands denied by the permission model", async () => {
		const shell = new PersistentShell({ initialCwd: tmpDir, defaultTimeoutMs: 5_000 });
		await shell.waitUntilReady();

		const result = await executeBashCommand(
			{ type: "execute_bash", command: "rm -rf /" },
			0,
			{
				shell,
				shellState: {
					sessionId: "perm-session",
					cwd: tmpDir,
					alive: true,
					lastExitCode: null,
				},
				limits: {
					maxStdoutLines: 200,
					maxStderrLines: 100,
					maxStdoutChars: 64_000,
					maxStderrChars: 16_000,
					maxReadLines: 500,
					maxGrepMatches: 100,
					maxLineChars: 500,
				},
				defaultTimeoutMs: 5_000,
			},
		);

		await shell.dispose();

		expect(result.success).toBe(false);
		expect(result.haltReason).toBe("permission_denied");
		expect(result.error).toMatch(/rejected/);
	});
});
