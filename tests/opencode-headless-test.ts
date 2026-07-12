/**
 * Headless integration test: execute batch_queue via OpenCode plugin with
 * explicit actions (no executor model / API call required).
 *
 * run: bun run tests/opencode-headless-test.ts
 */

import type { ToolContext } from "@opencode-ai/plugin";
import { createBatchedQueuePluginHooks } from "../src/opencode/plugin.ts";
import { DEFAULT_PATH_SECURITY } from "../src/lib/path-security.ts";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const tmpParent = path.join(path.dirname(fileURLToPath(import.meta.url)), ".tmp");
fs.mkdirSync(tmpParent, { recursive: true });
const tmpDir = fs.mkdtempSync(path.join(tmpParent, "bq-oc-headless-"));
fs.writeFileSync(path.join(tmpDir, "hello.txt"), "hello world\n");

const hooks = createBatchedQueuePluginHooks(
	{
		maxBatchActions: 5,
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
	sessionID: "opencode-headless-test",
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
			{ type: "read_lines", path: "hello.txt", startLine: 1, endLine: 1 },
			{ type: "execute_bash", command: "printf ok" },
		],
	},
	toolContext,
);

if (typeof result !== "string") {
	console.error("batch_queue should return a string on OpenCode");
	process.exit(1);
}

if (result.startsWith("ERROR:")) {
	console.error("batch_queue returned error:", result);
	process.exit(1);
}

if (!result.includes("✅ batch completed") || !result.includes("### Next steps")) {
	console.error("Unexpected batch result:\n", result);
	process.exit(1);
}

await hooks.event?.({
	event: {
		type: "session.deleted",
		properties: { info: { id: "opencode-headless-test" } },
	},
} as never);

console.log("OK: headless batch_queue execution via OpenCode plugin");
console.log(result.split("\n").slice(0, 4).join("\n"));

fs.rmSync(tmpDir, { recursive: true, force: true });
