/**
 * Smoke test: load the batched-queue extension the same way Pi does at startup.
 *
 * run: bun run smoke-test.ts
 */

import { discoverAndLoadExtensions } from "@mariozechner/pi-coding-agent";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const extensionPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "extension.ts");
const cwd = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const result = await discoverAndLoadExtensions([extensionPath], cwd);

if (result.errors.length > 0) {
	console.error("Extension load errors:");
	for (const error of result.errors) {
		console.error(`  - ${error.path}: ${error.error}`);
	}
	process.exit(1);
}

	let batchQueue: { name: string; label: string } | undefined;
for (const ext of result.extensions) {
	const tool = ext.tools.get("batch_queue");
	if (tool) {
		batchQueue = {
			name: tool.definition.name,
			label: tool.definition.label,
		};
		break;
	}
}

if (!batchQueue) {
	console.error("batch_queue tool not registered after extension load");
	for (const ext of result.extensions) {
		console.error(`  extension ${ext.path} tools: ${[...ext.tools.keys()].join(", ") || "(none)"}`);
	}
	process.exit(1);
}

console.log("OK: batched-queue extension loaded");
console.log(`  tool: ${batchQueue.name}`);
console.log(`  label: ${batchQueue.label}`);
