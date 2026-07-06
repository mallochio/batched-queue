import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveBatchQueueConfig } from "../src/config";
import {
	loadFileConfig,
	loadOpenCodeFileConfig,
	parseBatchQueueJsonConfig,
} from "../src/file-config";

describe("parseBatchQueueJsonConfig", () => {
	it("parses executor model shorthand", () => {
		expect(parseBatchQueueJsonConfig({
			executorModel: "openai/gpt-5.4-nano",
		})).toEqual({
			executorModel: { provider: "openai", id: "gpt-5.4-nano" },
		});
	});

	it("parses executor model object form", () => {
		expect(parseBatchQueueJsonConfig({
			executorModel: { provider: "openai", id: "gpt-5.4-mini" },
		})).toEqual({
			executorModel: { provider: "openai", id: "gpt-5.4-mini" },
		});
	});

	it("parses maxBatchActions", () => {
		expect(parseBatchQueueJsonConfig({ maxBatchActions: 8 })).toEqual({
			maxBatchActions: 8,
		});
	});

	it("parses allowObjectiveMutations", () => {
		expect(parseBatchQueueJsonConfig({ allowObjectiveMutations: true })).toEqual({
			allowObjectiveMutations: true,
		});
	});

	it("ignores invalid values", () => {
		expect(parseBatchQueueJsonConfig({
			maxBatchActions: "nope",
			executorModel: { provider: "", id: "x" },
		})).toEqual({});
	});
});

describe("loadFileConfig", () => {
	let tmpDir: string;
	let packageJsonPath: string;
	let projectConfigPath: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bq-config-"));
		packageJsonPath = path.join(tmpDir, "package.json");
		projectConfigPath = path.join(tmpDir, ".pi", "batched-queue.json");
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("loads executor model from package.json pi.batchQueue", () => {
		fs.writeFileSync(packageJsonPath, JSON.stringify({
			pi: {
				batchQueue: {
					executorModel: "openai/gpt-5.4-nano",
				},
			},
		}));

		const config = loadFileConfig({
			cwd: tmpDir,
			packageJsonPath,
			projectConfigPath,
		});

		expect(config.executorModel).toEqual({
			provider: "openai",
			id: "gpt-5.4-nano",
		});
	});

	it("lets project config override package defaults", () => {
		fs.mkdirSync(path.dirname(projectConfigPath), { recursive: true });
		fs.writeFileSync(packageJsonPath, JSON.stringify({
			pi: {
				batchQueue: {
					executorModel: "openai/gpt-5.4-nano",
					maxBatchActions: 3,
					allowObjectiveMutations: true,
				},
			},
		}));
		fs.writeFileSync(projectConfigPath, JSON.stringify({
			executorModel: "openai/gpt-5.4-mini",
			maxBatchActions: 7,
			allowObjectiveMutations: false,
		}));

		const config = loadFileConfig({
			cwd: tmpDir,
			packageJsonPath,
			projectConfigPath,
		});

		expect(config).toEqual({
			executorModel: { provider: "openai", id: "gpt-5.4-mini" },
			maxBatchActions: 7,
			allowObjectiveMutations: false,
		});
	});

	it("loads executionModel alias from project config", () => {
		fs.mkdirSync(path.dirname(projectConfigPath), { recursive: true });
		fs.writeFileSync(projectConfigPath, JSON.stringify({
			executionModel: "openai/gpt-5.4-mini",
		}));

		const config = loadFileConfig({
			cwd: tmpDir,
			packageJsonPath,
			projectConfigPath,
		});

		expect(config.executorModel).toEqual({
			provider: "openai",
			id: "gpt-5.4-mini",
		});
	});
});

describe("loadOpenCodeFileConfig", () => {
	let tmpDir: string;
	let packageJsonPath: string;
	let projectConfigPath: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bq-oc-config-"));
		packageJsonPath = path.join(tmpDir, "package.json");
		projectConfigPath = path.join(tmpDir, ".opencode", "batched-queue.json");
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("loads executor model from package.json opencode.batchQueue", () => {
		fs.writeFileSync(packageJsonPath, JSON.stringify({
			opencode: {
				batchQueue: {
					executorModel: "openai/gpt-5.4-nano",
				},
			},
		}));

		const config = loadOpenCodeFileConfig({
			cwd: tmpDir,
			packageJsonPath,
			projectConfigPath,
		});

		expect(config.executorModel).toEqual({
			provider: "openai",
			id: "gpt-5.4-nano",
		});
	});

	it("lets project config override package defaults", () => {
		fs.mkdirSync(path.dirname(projectConfigPath), { recursive: true });
		fs.writeFileSync(packageJsonPath, JSON.stringify({
			opencode: {
				batchQueue: {
					maxBatchActions: 3,
				},
			},
		}));
		fs.writeFileSync(projectConfigPath, JSON.stringify({
			maxBatchActions: 9,
		}));

		const config = loadOpenCodeFileConfig({
			cwd: tmpDir,
			packageJsonPath,
			projectConfigPath,
		});

		expect(config.maxBatchActions).toBe(9);
	});
});

describe("resolveBatchQueueConfig precedence", () => {
	const savedExecutor = process.env.BATCH_QUEUE_EXECUTOR;
	const savedMaxActions = process.env.BATCH_QUEUE_MAX_ACTIONS;
	const savedAllowObjectiveMutations = process.env.BATCH_QUEUE_ALLOW_OBJECTIVE_MUTATIONS;

	afterEach(() => {
		if (savedExecutor === undefined) {
			delete process.env.BATCH_QUEUE_EXECUTOR;
		} else {
			process.env.BATCH_QUEUE_EXECUTOR = savedExecutor;
		}
		if (savedMaxActions === undefined) {
			delete process.env.BATCH_QUEUE_MAX_ACTIONS;
		} else {
			process.env.BATCH_QUEUE_MAX_ACTIONS = savedMaxActions;
		}
		if (savedAllowObjectiveMutations === undefined) {
			delete process.env.BATCH_QUEUE_ALLOW_OBJECTIVE_MUTATIONS;
		} else {
			process.env.BATCH_QUEUE_ALLOW_OBJECTIVE_MUTATIONS = savedAllowObjectiveMutations;
		}
	});

	it("prefers env vars over file config", () => {
		process.env.BATCH_QUEUE_EXECUTOR = "openai/gpt-5.4-pro";
		const resolved = resolveBatchQueueConfig({}, {
			executorModel: { provider: "openai", id: "gpt-5.4-nano" },
		});
		expect(resolved.executorModel).toEqual({
			provider: "openai",
			id: "gpt-5.4-pro",
		});
	});

	it("uses file config when env is unset", () => {
		delete process.env.BATCH_QUEUE_EXECUTOR;
		const resolved = resolveBatchQueueConfig({}, {
			executorModel: { provider: "openai", id: "gpt-5.4-nano" },
		});
		expect(resolved.executorModel).toEqual({
			provider: "openai",
			id: "gpt-5.4-nano",
		});
	});

	it("prefers factory overrides over env and file config", () => {
		process.env.BATCH_QUEUE_EXECUTOR = "openai/gpt-5.4-pro";
		const resolved = resolveBatchQueueConfig({
			executorModel: { provider: "openai", id: "gpt-5.4-mini" },
		}, {
			executorModel: { provider: "openai", id: "gpt-5.4-nano" },
		});
		expect(resolved.executorModel).toEqual({
			provider: "openai",
			id: "gpt-5.4-mini",
		});
	});

	it("defaults maxBatchActions to 10", () => {
		delete process.env.BATCH_QUEUE_MAX_ACTIONS;
		const resolved = resolveBatchQueueConfig();
		expect(resolved.maxBatchActions).toBe(10);
	});

	it("disables objective mutations by default", () => {
		delete process.env.BATCH_QUEUE_ALLOW_OBJECTIVE_MUTATIONS;
		const resolved = resolveBatchQueueConfig();
		expect(resolved.allowObjectiveMutations).toBe(false);
	});

	it("prefers env objective mutation flag over file config", () => {
		process.env.BATCH_QUEUE_ALLOW_OBJECTIVE_MUTATIONS = "true";
		const resolved = resolveBatchQueueConfig({}, {
			allowObjectiveMutations: false,
		});
		expect(resolved.allowObjectiveMutations).toBe(true);
	});
});
