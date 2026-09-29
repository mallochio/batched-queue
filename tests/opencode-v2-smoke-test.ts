/**
 * Smoke test: load the OpenCode 2 plugin entry and check its Plugin.define shape.
 *
 * run: bun run tests/opencode-v2-smoke-test.ts
 */
import entry from "../.opencode/plugins/batched-queue.ts";

if (entry.id !== "batched-queue" || typeof entry.setup !== "function") {
	console.error("OpenCode plugin entry must export { id: \"batched-queue\", setup }");
	process.exit(1);
}
console.log("OK: OpenCode 2 plugin entry loads");
