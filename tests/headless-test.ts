/**
 * Headless integration test: load extension via Pi loader and execute batch_queue
 * with a pre-planned action batch (no executor model / API call required).
 *
 * run: bun run headless-test.ts
 */

import {
	discoverAndLoadExtensions,
	type ExtensionContext,
	type RegisteredTool,
} from "@mariozechner/pi-coding-agent";
import type { Model } from "@mariozechner/pi-ai";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const extensionDir = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(extensionDir, "..", "src", "extension.ts");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bq-headless-"));
fs.writeFileSync(path.join(tmpDir, "hello.txt"), "hello world\n");

const loadResult = await discoverAndLoadExtensions([extensionPath], tmpDir);

if (loadResult.errors.length > 0) {
	console.error("Extension load failed:", loadResult.errors);
	process.exit(1);
}

let registeredTool: RegisteredTool | undefined;
for (const ext of loadResult.extensions) {
	const tool = ext.tools.get("batch_queue");
	if (tool) {
		registeredTool = tool;
		break;
	}
}

if (!registeredTool) {
	console.error("batch_queue not registered");
	process.exit(1);
}

const mockContext = {
	cwd: tmpDir,
	model: { provider: "test", id: "mock-model" } as Model<"openai-completions">,
	sessionManager: {
		getSessionId: () => "headless-test-session",
	},
	modelRegistry: {
		find: () => undefined,
		getApiKeyAndHeaders: async () => ({ ok: false as const, error: "no model in test" }),
	},
	ui: {
		select: async () => undefined,
		confirm: async () => false,
		input: async () => undefined,
		editor: async () => undefined,
		notify: () => {},
		setStatus: () => {},
		setWidget: () => {},
		setTitle: () => {},
		setEditorText: () => {},
		setFooter: () => {},
		custom: async () => undefined,
	},
	hasUI: false,
	signal: undefined,
	isIdle: () => true,
	abort: () => {},
	hasPendingMessages: () => false,
	shutdown: () => {},
	getContextUsage: () => undefined,
	compact: () => {},
	getSystemPrompt: () => "",
} as unknown as ExtensionContext;

const result = await registeredTool.definition.execute(
	"test-call-1",
	{
		actions: [
			{ type: "read_lines", path: "hello.txt", startLine: 1, endLine: 1 },
			{ type: "execute_bash", command: "printf ok" },
		],
	},
	undefined,
	undefined,
	mockContext,
);

const toolResult = result as typeof result & { isError?: boolean };

if (toolResult.isError) {
	console.error("batch_queue returned error:", toolResult.content[0]);
	process.exit(1);
}

const text = toolResult.content[0]?.type === "text" ? toolResult.content[0].text : "";
if (!text.includes("batch completed successfully")) {
	console.error("Unexpected batch result:\n", text);
	process.exit(1);
}

for (const ext of loadResult.extensions) {
	const handlers = ext.handlers.get("session_shutdown") ?? [];
	for (const handler of handlers) {
		await handler({ type: "session_shutdown" }, mockContext);
	}
}

console.log("OK: headless batch_queue execution via Pi extension loader");
console.log(text.split("\n").slice(0, 4).join("\n"));

fs.rmSync(tmpDir, { recursive: true, force: true });
