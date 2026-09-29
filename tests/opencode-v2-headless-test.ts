/**
 * Headless test: run the OpenCode 2 plugin setup with a mock context and execute batch_queue.
 *
 * run: bun run tests/opencode-v2-headless-test.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import plugin from "../.opencode/plugins/batched-queue.ts";

type Tool = { name: string; execute: (input: unknown, ctx: { sessionID: string }) => Promise<{ content: string }> };

const tmpParent = path.join(path.dirname(fileURLToPath(import.meta.url)), ".tmp");
fs.mkdirSync(tmpParent, { recursive: true });
const dir = fs.mkdtempSync(path.join(tmpParent, "bq-opencode-"));
fs.writeFileSync(path.join(dir, "hello.txt"), "hello world\n");

let tool: Tool | undefined;
const ctx = {
	tool: { transform: async (fn: (editor: { add: (t: Tool) => void }) => void) => fn({ add: (t) => { tool = t; } }) },
	session: { get: async () => ({ location: { directory: dir } }) },
	event: { subscribe: async function* () {} },
};

const dispose = await (plugin.setup as unknown as (c: typeof ctx) => Promise<() => Promise<void>>)(ctx);
if (!tool) {
	console.error("batch_queue not registered");
	process.exit(1);
}
const result = await tool.execute(
	{ actions: [{ type: "read_lines", path: "hello.txt" }, { type: "execute_bash", command: "cat hello.txt" }] },
	{ sessionID: "opencode-test" },
);
await dispose();
fs.rmSync(dir, { recursive: true, force: true });

if (!result.content.includes("✓ batch completed") || !result.content.includes("hello world")) {
	console.error("Unexpected result:\n", result.content);
	process.exit(1);
}
console.log("OK: OpenCode 2 batch_queue execution");
