import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	loadFileConfig,
	OPENCODE_PROJECT_CONFIG_PATH,
	PI_PROJECT_CONFIG_PATH,
	PRIME_AGENT_PROJECT_CONFIG_PATH,
} from "../src/file-config";

function withTempDir(run: (dir: string) => void): void {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "batched-queue-config-"));
	try {
		run(dir);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

describe("loadFileConfig project paths", () => {
	it("loads Prime Agent project config for the pi target", () => {
		withTempDir((dir) => {
			const configDir = path.join(dir, path.dirname(PRIME_AGENT_PROJECT_CONFIG_PATH));
			fs.mkdirSync(configDir, { recursive: true });
			fs.writeFileSync(
				path.join(dir, PRIME_AGENT_PROJECT_CONFIG_PATH),
				JSON.stringify({ maxBatchActions: 7 }),
			);

			expect(loadFileConfig({ cwd: dir, packageJsonPath: path.join(dir, "missing-package.json") }))
				.toEqual({ maxBatchActions: 7 });
		});
	});

	it("lets Prime Agent config override legacy .pi settings", () => {
		withTempDir((dir) => {
			fs.mkdirSync(path.join(dir, path.dirname(PI_PROJECT_CONFIG_PATH)), { recursive: true });
			fs.mkdirSync(path.join(dir, path.dirname(PRIME_AGENT_PROJECT_CONFIG_PATH)), { recursive: true });
			fs.writeFileSync(
				path.join(dir, PI_PROJECT_CONFIG_PATH),
				JSON.stringify({ maxBatchActions: 4, groundingTurns: 1 }),
			);
			fs.writeFileSync(
				path.join(dir, PRIME_AGENT_PROJECT_CONFIG_PATH),
				JSON.stringify({ maxBatchActions: 9 }),
			);

			expect(loadFileConfig({ cwd: dir, packageJsonPath: path.join(dir, "missing-package.json") }))
				.toEqual({ maxBatchActions: 9, groundingTurns: 1 });
		});
	});

	it("loads OpenCode project config", () => {
		withTempDir((dir) => {
			fs.mkdirSync(path.join(dir, path.dirname(OPENCODE_PROJECT_CONFIG_PATH)), { recursive: true });
			fs.writeFileSync(
				path.join(dir, OPENCODE_PROJECT_CONFIG_PATH),
				JSON.stringify({ allowObjectiveMutations: true }),
			);

			expect(
				loadFileConfig({
					target: "opencode",
					cwd: dir,
					packageJsonPath: path.join(dir, "missing-package.json"),
				}),
			).toEqual({ allowObjectiveMutations: true });
		});
	});
});
