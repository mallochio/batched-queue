import { describe, expect, it } from "bun:test";
import { captureStreamText } from "../src/capture";
import { BatchQueueRunner } from "../src/queue-runner";

describe("output truncation", () => {
	it("marks omitted lines between head and tail", () => {
		const text = Array.from({ length: 10 }, (_, i) => `line ${i}`).join("\n");
		const captured = captureStreamText(text, 4, 10_000);
		expect(captured.text).toBe("line 0\nline 1\n... [6 lines omitted] ...\nline 8\nline 9");
	});
});

describe("concurrent batches", () => {
	it("runs batches for one session one at a time", async () => {
		const runner = new BatchQueueRunner("concurrency", process.cwd());
		const [a, b] = await Promise.all([
			runner.executeBatch({ actions: [{ type: "execute_bash", command: "export X=1; sleep 0.2; echo a$X" }] }),
			runner.executeBatch({ actions: [{ type: "execute_bash", command: "echo b$X" }] }),
		]);
		await runner.dispose();
		const out = (r: typeof a) => (r.results[0]?.type === "execute_bash" ? r.results[0].stdout.text.trim() : "");
		expect(out(a)).toBe("a1");
		expect(out(b)).toBe("b1");
	});
});
