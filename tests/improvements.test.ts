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

describe("commands that call exit", () => {
	it("keep stderr and the real exit code, and the next batch still runs", async () => {
		const runner = new BatchQueueRunner("exit-test", process.cwd());
		const failed = await runner.executeBatch({
			actions: [{ type: "execute_bash", command: "echo out; echo 'error: type mismatch' >&2; exit 2" }],
		});
		const next = await runner.executeBatch({ actions: [{ type: "execute_bash", command: "echo alive" }] });
		await runner.dispose();
		const r = failed.results[0];
		expect(r?.type === "execute_bash" && r.exitCode).toBe(2);
		expect(r?.type === "execute_bash" && r.stderr.text).toContain("error: type mismatch");
		expect(r?.type === "execute_bash" && r.stdout.text).toContain("out");
		const n = next.results[0];
		expect(n?.type === "execute_bash" && n.stdout.text.trim()).toBe("alive");
	});

	it("restarts the shell mid-batch after exit 0", async () => {
		const runner = new BatchQueueRunner("exit-zero", process.cwd());
		const result = await runner.executeBatch({
			actions: [
				{ type: "execute_bash", command: "echo first; exit 0" },
				{ type: "execute_bash", command: "echo second" },
			],
		});
		await runner.dispose();
		expect(result.haltedPrematurely).toBe(false);
		const second = result.results[1];
		expect(second?.type === "execute_bash" && second.stdout.text.trim()).toBe("second");
	});
});
