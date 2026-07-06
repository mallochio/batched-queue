/**
 * Agent integration test: batch_queue with objective planning via a tiny executor model.
 *
 * Requires OPENAI_API_KEY (or configured provider key) in the environment.
 * run: bun run tests/agent-objective-test.ts
 */

import {
	AuthStorage,
	discoverAndLoadExtensions,
	type ExtensionContext,
	type RegisteredTool,
	ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const extensionDir = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(extensionDir, "..", "src", "extension.ts");
const tmpParent = path.join(extensionDir, ".tmp");
fs.mkdirSync(tmpParent, { recursive: true });
const tmpDir = fs.mkdtempSync(path.join(tmpParent, "bq-agent-"));
fs.writeFileSync(path.join(tmpDir, "sample.txt"), "alpha\nbeta\ngamma\n");

const executorModelId = process.env.BATCH_QUEUE_EXECUTOR ?? "openai/gpt-5.4-nano";
const slash = executorModelId.indexOf("/");
const executorProvider = slash === -1 ? "openai" : executorModelId.slice(0, slash);
const executorId = slash === -1 ? executorModelId : executorModelId.slice(slash + 1);

const authStorage = AuthStorage.create(path.join(tmpParent, "bq-agent-auth"));
const modelRegistry = ModelRegistry.inMemory(authStorage);

const driverModel = modelRegistry.find(executorProvider, executorId);
if (!driverModel) {
	console.error(`Model not found: ${executorProvider}/${executorId}`);
	process.exit(1);
}

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
	model: driverModel as Model<"openai-completions">,
	sessionManager: {
		getSessionId: () => "agent-objective-test",
	},
	modelRegistry,
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
	"agent-objective-1",
	{
		objective:
			"Read line 2 of sample.txt and run a shell command that prints the word verified",
	},
	undefined,
	undefined,
	mockContext,
);

const toolResult = result as typeof result & { isError?: boolean };

if (toolResult.isError) {
	console.error("batch_queue objective run failed:", toolResult.content[0]);
	process.exit(1);
}

const text = toolResult.content[0]?.type === "text" ? toolResult.content[0].text : "";
if (!text.includes("batch completed successfully") && !text.includes("read_lines")) {
	console.error("Unexpected objective batch result:\n", text);
	process.exit(1);
}

for (const ext of loadResult.extensions) {
	const handlers = ext.handlers.get("session_shutdown") ?? [];
	for (const handler of handlers) {
		await handler({ type: "session_shutdown" }, mockContext);
	}
}

console.log("OK: batch_queue objective planning via tiny executor model");
console.log(text.split("\n").slice(0, 8).join("\n"));

fs.rmSync(tmpDir, { recursive: true, force: true });
