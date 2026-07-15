/**
 * Headless integration test: explicit apply_diff via OpenCode plugin.
 *
 * run: bun run tests/opencode-apply-diff-test.ts
 */

import type { ToolContext } from "@opencode-ai/plugin";
import { createBatchedQueuePluginHooks } from "../src/opencode/plugin.ts";
import { DEFAULT_PATH_SECURITY } from "../src/lib/path-security.ts";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const tmpParent = path.join(path.dirname(fileURLToPath(import.meta.url)), ".tmp");
fs.mkdirSync(tmpParent, { recursive: true });
const tmpDir = fs.mkdtempSync(path.join(tmpParent, "bq-oc-diff-"));
const targetPath = path.join(tmpDir, "hello.txt");
fs.writeFileSync(targetPath, "hello\n");

const hooks = createBatchedQueuePluginHooks(
	{
		maxBatchActions: 5,
		groundingTurns: 0,
		requirePlanReflection: true,
		allowObjectiveMutations: false,
		pathSecurity: DEFAULT_PATH_SECURITY,
	},
	{
		session: {
			prompt: async () => ({ data: { info: {}, parts: [] } }),
		},
	} as never,
);

const batchQueue = hooks.tool?.batch_queue;
if (!batchQueue || typeof batchQueue.execute !== "function") {
	console.error("batch_queue tool not available");
	process.exit(1);
}

const toolContext: ToolContext = {
	agent: "build",
	sessionID: "opencode-apply-diff-test",
	messageID: "msg-1",
	directory: tmpDir,
	worktree: tmpDir,
	abort: new AbortController().signal,
	metadata: () => {},
	ask: async () => {},
};

const result = await batchQueue.execute(
	{
		actions: [
			{
				type: "apply_diff",
				path: "hello.txt",
				oldText: "hello",
				newText: "hello world",
			},
		],
	},
	toolContext,
);

if (typeof result !== "string" || result.startsWith("ERROR:")) {
	console.error("batch_queue apply_diff failed:", result);
	process.exit(1);
}

const updated = fs.readFileSync(targetPath, "utf8");
if (!updated.includes("hello world")) {
	console.error("file was not updated:", updated);
	process.exit(1);
}

await hooks.event?.({
	event: {
		type: "session.deleted",
		properties: { info: { id: "opencode-apply-diff-test" } },
	},
} as never);

console.log("OK: OpenCode explicit apply_diff with allowObjectiveMutations=false");
console.log(updated.trim());

fs.rmSync(tmpDir, { recursive: true, force: true });
