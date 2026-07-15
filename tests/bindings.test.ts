import { describe, expect, it } from "bun:test";
import { bindActionResult, resolveActionBindings, BatchVariableResolutionError } from "../src/bindings";
import type { QueueAction } from "../src/actions";
import type { ExecuteBashActionResult, ReadLinesActionResult } from "../src/results";

describe("batch variable bindings", () => {
	it("binds an action result and interpolates later action strings", () => {
		const bindings: Record<string, string> = {};
		const readAction: QueueAction = { type: "read_lines", path: "hello.txt", bindTo: "snippet" };
		const readResult: ReadLinesActionResult = {
			index: 0,
			type: "read_lines",
			success: true,
			exitCode: 0,
			durationMs: 1,
			path: "hello.txt",
			lines: [{ lineNumber: 1, text: "hello world" }],
			formatted: "1: hello world",
			totalLinesInFile: 1,
		};

		bindActionResult(readAction, readResult, bindings);
		const bashAction = resolveActionBindings(
			{ type: "execute_bash", command: "printf '%s' '${snippet}'" },
			bindings,
		);

		expect(bashAction.type).toBe("execute_bash");
		if (bashAction.type === "execute_bash") {
			expect(bashAction.command).toBe("printf '%s' '1: hello world'");
		}
	});

	it("throws on unbound variables", () => {
		expect(() => resolveActionBindings(
			{ type: "execute_bash", command: "echo ${missing}" },
			{},
		)).toThrow(BatchVariableResolutionError);
	});

	it("binds bash stdout", () => {
		const bindings: Record<string, string> = {};
		const action: QueueAction = { type: "execute_bash", command: "printf ok", bindTo: "out" };
		const result: ExecuteBashActionResult = {
			index: 0,
			type: "execute_bash",
			success: true,
			exitCode: 0,
			durationMs: 1,
			command: "printf ok",
			stdout: { text: "ok" },
			stderr: { text: "" },
		};
		bindActionResult(action, result, bindings);
		expect(bindings.out).toBe("ok");
	});
});
