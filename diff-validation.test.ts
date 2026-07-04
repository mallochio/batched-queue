/**
 * diff validation and config tests
 *
 * run: bun test pi-config/extensions/batched-queue/diff-validation.test.ts
 */

import { describe, it, expect } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	applyDiffToContent,
	normalizeForDiffMatch,
	validateAndPrepareDiff,
	validateSyntax,
	routeSyntaxLanguage,
} from "./diff-validation";
import { resolveBatchQueueConfig, parseModelRefString } from "./config";
import { parseActionBatchPayload } from "./guards";

describe("semantic normalization", () => {
	it("normalizes CRLF and trailing whitespace", () => {
		expect(normalizeForDiffMatch("foo  \r\nbar\t  ")).toBe("foo\nbar");
	});
});

describe("sliding window matcher", () => {
	it("matches blocks when trailing whitespace differs", () => {
		const content = "function test() {\n  return 1;  \n}\n";
		const oldText = "function test() {\n  return 1;\n}";
		const result = applyDiffToContent(content, oldText, "function test() {\n  return 2;\n}", false);
		expect(result?.match.strategy).toBe("normalized");
		expect(result?.updated).toContain("return 2;");
	});
});

describe("syntax router", () => {
	it("routes typescript files", () => {
		expect(routeSyntaxLanguage("src/app.ts")).toBe("typescript");
	});

	it("bypasses markdown", () => {
		expect(routeSyntaxLanguage("README.md")).toBe("unsupported");
		expect(validateSyntax("README.md", "# Title\n")).toEqual([]);
	});

	it("rejects invalid json", () => {
		const errors = validateSyntax("config.json", "{ invalid }");
		expect(errors.length).toBeGreaterThan(0);
	});

	it("accepts valid typescript", () => {
		const errors = validateSyntax("file.ts", "export const x = 1;\n");
		expect(errors).toEqual([]);
	});
});

describe("validateAndPrepareDiff", () => {
	it("applies diff and validates syntax before persist", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bq-diff-"));
		const filePath = path.join(tmpDir, "sample.ts");
		fs.writeFileSync(filePath, "export const value = 1;\n");

		const result = validateAndPrepareDiff(
			filePath,
			fs.readFileSync(filePath, "utf8"),
			{ oldText: "value = 1", newText: "value = 2" },
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.updatedContent).toContain("value = 2");
			expect(result.matchStrategy).toBe("exact");
		}

		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("rejects patches that break typescript syntax", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bq-diff-"));
		const filePath = path.join(tmpDir, "broken.ts");
		fs.writeFileSync(filePath, "export const value = 1;\n");

		const result = validateAndPrepareDiff(
			filePath,
			fs.readFileSync(filePath, "utf8"),
			{ oldText: "export const value = 1;", newText: "export const value =" },
		);

		expect(result.ok).toBe(false);
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});
});

describe("configurable batch ceiling", () => {
	it("respects maxBatchActions override", () => {
		const config = resolveBatchQueueConfig({ maxBatchActions: 12 });
		expect(config.maxBatchActions).toBe(12);

		const actions = Array.from({ length: 12 }, () => ({
			type: "execute_bash" as const,
			command: "echo ok",
		}));

		const payload = parseActionBatchPayload({ actions }, config.maxBatchActions);
		expect(payload.actions).toHaveLength(12);
	});

	it("parses executor model shorthand", () => {
		expect(parseModelRefString("openrouter/deepseek/deepseek-v3.2-exp")).toEqual({
			provider: "openrouter",
			id: "deepseek/deepseek-v3.2-exp",
		});
	});
});
