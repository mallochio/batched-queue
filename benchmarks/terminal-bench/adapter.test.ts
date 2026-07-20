import { describe, expect, it } from "bun:test";
import {
	adaptersAreParityChecked,
	createTerminalBenchAdapter,
	loadTerminalBenchTasks,
} from "./adapter.ts";

describe("Terminal-Bench adapter scaffold", () => {
	it("creates native adapter without batch_queue", () => {
		const adapter = createTerminalBenchAdapter("native");
		expect(adapter.condition).toBe("native");
		expect(adapter.tools).not.toContain("batch_queue");
		expect(adapter.supportsBatchQueue).toBe(false);
	});

	it("creates batch adapter with batch_queue as only extra tool", () => {
		const adapter = createTerminalBenchAdapter("batch");
		expect(adapter.condition).toBe("batch");
		expect(adapter.tools).toContain("batch_queue");
		expect(adapter.supportsBatchQueue).toBe(true);
	});

	it("passes parity check between native and batch adapters", () => {
		const native = createTerminalBenchAdapter("native");
		const batch = createTerminalBenchAdapter("batch");
		expect(adaptersAreParityChecked(native, batch)).toBe(true);
	});

	it("fails parity when batch adds a non-batch_queue tool", () => {
		const native = createTerminalBenchAdapter("native");
		const batch = {
			...createTerminalBenchAdapter("batch"),
			tools: [...createTerminalBenchAdapter("batch").tools, "extra_tool"],
		};
		expect(adaptersAreParityChecked(native, batch)).toBe(false);
	});

	it("fails parity when native is missing a base tool", () => {
		const native = createTerminalBenchAdapter("native");
		const batch = createTerminalBenchAdapter("batch");
		const brokenNative = { ...native, tools: native.tools.slice(1) };
		expect(adaptersAreParityChecked(brokenNative, batch)).toBe(false);
	});

	it("loadTerminalBenchTasks loads the pinned Terminal-Bench dataset", () => {
		const tasks = loadTerminalBenchTasks("benchmarks/terminal-bench/dataset.jsonl");
		expect(tasks.length).toBe(80);
		expect(tasks[0].id).toBe("hello-world");
		expect(tasks.some((t) => t.category === "ml")).toBe(true);
		// Budget gate: the loader returns tasks but does not execute them.
		expect(tasks.every((t) => typeof t.id === "string")).toBe(true);
	});

	it("loadTerminalBenchTasks returns empty array for missing file", () => {
		expect(loadTerminalBenchTasks("nonexistent.jsonl")).toEqual([]);
	});
});
