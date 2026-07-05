/**
 * Smoke test: load the batched-queue OpenCode plugin and verify tool registration.
 *
 * run: bun run tests/opencode-smoke-test.ts
 */

import type { PluginInput } from "@opencode-ai/plugin";
import { BatchedQueuePlugin } from "../src/opencode/plugin.ts";

const pluginInput = {
	client: {
		session: {
			prompt: async () => ({ data: { info: {}, parts: [] } }),
		},
	},
	directory: process.cwd(),
	project: {
		id: "test-project",
		worktree: process.cwd(),
		time: { created: 0, updated: 0 },
	},
	worktree: process.cwd(),
	$: undefined,
	experimental_workspace: {
		register: () => {},
	},
	serverUrl: new URL("http://127.0.0.1:4096"),
} as unknown as PluginInput;

const hooks = await BatchedQueuePlugin(pluginInput);

const batchQueue = hooks.tool?.batch_queue;
if (!batchQueue) {
	console.error("batch_queue tool not registered in OpenCode plugin");
	process.exit(1);
}

if (!batchQueue.description?.includes("batch")) {
	console.error("batch_queue description missing expected content");
	process.exit(1);
}

if (typeof batchQueue.execute !== "function") {
	console.error("batch_queue execute is not a function");
	process.exit(1);
}

console.log("OK: batched-queue OpenCode plugin loaded");
console.log(`  tool: batch_queue`);
console.log(`  description length: ${batchQueue.description.length}`);
