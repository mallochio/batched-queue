import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCompleteImplementation } from "../src/analyzer";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("Pi AI completion compatibility", () => {
	it("loads complete() without relying on static compat subpath imports", async () => {
		const complete = await resolveCompleteImplementation();
		expect(complete).toBeFunction();
	});

	it("does not statically import @earendil-works/pi-ai/compat at runtime", () => {
		const analyzerSource = fs.readFileSync(
			path.join(repoRoot, "src", "analyzer.ts"),
			"utf8",
		);

		expect(analyzerSource).not.toContain('from "@earendil-works/pi-ai/compat"');
		expect(analyzerSource).not.toContain("from '@earendil-works/pi-ai/compat'");
	});
});
