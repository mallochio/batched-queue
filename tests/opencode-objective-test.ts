/**
 * Headless integration test: execute batch_queue objective mode via the OpenCode
 * plugin. Mocks the OpenCode client so the structured-output planner returns a
 * batch without a real API call, exercising analyzeOpenCodeBatchObjective end to end.
 *
 * run: bun run tests/opencode-objective-test.ts
 */

import type { ToolContext } from "@opencode-ai/plugin";
import { createBatchedQueuePluginHooks } from "../src/opencode/plugin.ts";
import { DEFAULT_PATH_SECURITY } from "../src/lib/path-security.ts";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const tmpParent = path.join(path.dirname(fileURLToPath(import.meta.url)), ".tmp");
fs.mkdirSync(tmpParent, { recursive: true });
const tmpDir = fs.mkdtempSync(path.join(tmpParent, "bq-oc-objective-"));
fs.writeFileSync(path.join(tmpDir, "hello.txt"), "hello world\n");

let lastPromptText = "";

// Minimal OpenCode client: resolves a session model, then returns a structured
// batch plan for the planning prompt.
const client = {
	session: {
		get: async () => ({ data: { providerID: "test", modelID: "mock-model" } }),
		messages: async () => ({ data: [] }),
		create: async () => ({ data: { id: "plan-session" } }),
		delete: async () => ({ data: {} }),
		prompt: async (req: { body?: { parts?: Array<{ text?: string }> } }) => {
			lastPromptText = req.body?.parts?.map((p) => p.text ?? "").join("\n") ?? "";
			return {
				data: {
					info: {
						structured: {
							actions: [{ type: "read_lines", path: "hello.txt", startLine: 1, endLine: 1 }],
							rationale: "read the file",
						},
					},
					parts: [],
				},
			};
		},
	},
} as never;

const hooks = createBatchedQueuePluginHooks(
	{
		maxBatchActions: 5,
		groundingTurns: 3, // default-like; OpenCode path must NOT advertise inspect tools
		allowObjectiveMutations: false,
		pathSecurity: DEFAULT_PATH_SECURITY,
	},
	client,
);

const batchQueue = hooks.tool?.batch_queue;
if (!batchQueue || typeof batchQueue.execute !== "function") {
	console.error("batch_queue tool not available");
	process.exit(1);
}

const toolContext: ToolContext = {
	agent: "build",
	sessionID: "opencode-objective-test",
	messageID: "msg-1",
	directory: tmpDir,
	worktree: tmpDir,
	abort: new AbortController().signal,
	metadata: () => {},
	ask: async () => {},
};

const result = await batchQueue.execute({ objective: "read hello.txt" }, toolContext);

if (typeof result !== "string" || result.startsWith("ERROR:")) {
	console.error("objective batch failed:", result);
	process.exit(1);
}

if (!result.includes("✅ batch completed") || !result.includes("hello world")) {
	console.error("Unexpected objective batch result:\n", result);
	process.exit(1);
}

// The OpenCode planner must not be told to use the Pi-only inspect tools.
if (lastPromptText.includes("inspect_read") || lastPromptText.includes("inspect_grep")) {
	console.error("OpenCode planner prompt leaked Pi-only inspect tools:\n", lastPromptText);
	process.exit(1);
}

// It should still get the short-batch guidance shared with the Pi path.
if (!lastPromptText.includes("Prefer short batches")) {
	console.error("OpenCode planner prompt missing short-batch guidance");
	process.exit(1);
}

await hooks.event?.({
	event: {
		type: "session.deleted",
		properties: { info: { id: "opencode-objective-test" } },
	},
} as never);

console.log("OK: OpenCode objective mode planned + executed without inspect-tool leakage");
console.log(result.split("\n").slice(0, 4).join("\n"));

fs.rmSync(tmpDir, { recursive: true, force: true });
