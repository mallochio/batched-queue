/**
 * Smoke test: load the OpenCode V2 dual entry and verify Plugin.define shape.
 *
 * run: bun run tests/opencode-v2-smoke-test.ts
 */

import entry, {
	BatchedQueuePlugin,
	BatchedQueueV2Plugin,
} from "../src/opencode/entry.ts";

if (BatchedQueueV2Plugin.id !== "batched-queue") {
	console.error(`expected V2 plugin id "batched-queue", got ${BatchedQueueV2Plugin.id}`);
	process.exit(1);
}

if (typeof BatchedQueueV2Plugin.setup !== "function") {
	console.error("V2 plugin missing setup()");
	process.exit(1);
}

if (entry.id !== "batched-queue") {
	console.error(`expected dual entry id "batched-queue", got ${String(entry.id)}`);
	process.exit(1);
}

if (typeof entry.setup !== "function") {
	console.error("dual entry missing setup()");
	process.exit(1);
}

if (typeof entry.server !== "function") {
	console.error("dual entry missing server() for V1 compatibility");
	process.exit(1);
}

if (typeof BatchedQueuePlugin !== "function") {
	console.error("V1 BatchedQueuePlugin export missing");
	process.exit(1);
}

console.log("OK: OpenCode dual V1/V2 entry loads");
console.log(`  id: ${entry.id}`);
console.log("  setup: present");
console.log("  server: present");
