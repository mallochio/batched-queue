/**
 * Verify OpenCode Zod args accept explicit apply_diff when allowObjectiveMutations is false.
 *
 * run: bun run tests/opencode-schemas.test.ts
 */

import { createBatchQueueZodArgs } from "../src/opencode/schemas-zod.ts";
import { DEFAULT_PATH_SECURITY } from "../src/lib/path-security.ts";

const args = createBatchQueueZodArgs({
	maxBatchActions: 5,
	allowObjectiveMutations: false,
	pathSecurity: DEFAULT_PATH_SECURITY,
});

const actionSchema = args.actions.unwrap().element;
const parsed = actionSchema.safeParse({
	type: "apply_diff",
	path: "hello.txt",
	oldText: "hello",
	newText: "hello world",
});

if (!parsed.success) {
	console.error("apply_diff should be accepted in explicit actions:", parsed.error.flatten());
	process.exit(1);
}

console.log("OK: OpenCode explicit actions accept apply_diff with allowObjectiveMutations=false");
