import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { BatchQueueConfig, ExecutorThinkingLevel, ModelRef } from "./config.js";
import { parseExecutorThinking, parseModelRefString } from "./config.js";

const PI_PROJECT_CONFIG_RELATIVE = path.join(".pi", "batched-queue.json");
const OPENCODE_PROJECT_CONFIG_RELATIVE = path.join(".opencode", "batched-queue.json");

export const PI_PROJECT_CONFIG_PATH = PI_PROJECT_CONFIG_RELATIVE;
export const OPENCODE_PROJECT_CONFIG_PATH = OPENCODE_PROJECT_CONFIG_RELATIVE;

export type ConfigTarget = "pi" | "opencode";

const TARGET_SETTINGS: Record<ConfigTarget, { readonly section: "pi" | "opencode"; readonly projectConfigRelative: string }> = {
	pi: { section: "pi", projectConfigRelative: PI_PROJECT_CONFIG_RELATIVE },
	opencode: { section: "opencode", projectConfigRelative: OPENCODE_PROJECT_CONFIG_RELATIVE },
};

export interface BatchQueueJsonConfig {
	readonly maxBatchActions?: number;
	readonly executorModel?: string | ModelRef;
	readonly executionModel?: string | ModelRef;
	readonly executorThinking?: ExecutorThinkingLevel;
	readonly groundingTurns?: number;
	readonly allowObjectiveMutations?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseModelRefValue(value: unknown): ModelRef | undefined {
	if (typeof value === "string" && value.trim()) {
		return parseModelRefString(value);
	}
	if (!isRecord(value)) {
		return undefined;
	}
	const provider = typeof value.provider === "string" ? value.provider.trim() : "";
	const id = typeof value.id === "string" ? value.id.trim() : "";
	if (!provider || !id) {
		return undefined;
	}
	return { provider, id };
}

export function parseBatchQueueJsonConfig(raw: unknown): BatchQueueConfig {
	if (!isRecord(raw)) {
		return {};
	}

	const config: BatchQueueConfig = {};
	if (typeof raw.maxBatchActions === "number" && Number.isFinite(raw.maxBatchActions)) {
		config.maxBatchActions = raw.maxBatchActions;
	}

	const executorModel =
		parseModelRefValue(raw.executionModel) ??
		parseModelRefValue(raw.executorModel);
	if (executorModel) {
		config.executorModel = executorModel;
	}

	const executorThinking = parseExecutorThinking(raw.executorThinking);
	if (executorThinking) {
		config.executorThinking = executorThinking;
	}

	if (typeof raw.groundingTurns === "number" && Number.isFinite(raw.groundingTurns) && raw.groundingTurns >= 0) {
		config.groundingTurns = raw.groundingTurns;
	}

	if (typeof raw.allowObjectiveMutations === "boolean") {
		config.allowObjectiveMutations = raw.allowObjectiveMutations;
	}

	return config;
}

function readJsonFile(filePath: string): unknown {
	try {
		return JSON.parse(fs.readFileSync(filePath, "utf8"));
	} catch {
		return undefined;
	}
}

function readConfigFile(filePath: string): BatchQueueConfig {
	if (!fs.existsSync(filePath)) {
		return {};
	}
	return parseBatchQueueJsonConfig(readJsonFile(filePath));
}

function readPackageJsonConfig(
	packageJsonPath: string,
	section: "pi" | "opencode",
): BatchQueueConfig {
	if (!fs.existsSync(packageJsonPath)) {
		return {};
	}
	const raw = readJsonFile(packageJsonPath);
	if (!isRecord(raw) || !isRecord(raw[section])) {
		return {};
	}
	return parseBatchQueueJsonConfig(raw[section].batchQueue);
}

export interface LoadFileConfigOptions {
	readonly target?: ConfigTarget;
	readonly cwd?: string;
	readonly packageJsonPath?: string;
	readonly projectConfigPath?: string;
}

export function defaultPackageJsonPath(): string {
	const moduleDir = path.dirname(fileURLToPath(import.meta.url));
	return path.join(moduleDir, "..", "package.json");
}

/**
 * Load batched-queue settings from JSON files.
 *
 * Precedence within file sources (later wins):
 * 1. package.json → {pi|opencode}.batchQueue (package defaults)
 * 2. project config in cwd (.pi/ or .opencode/batched-queue.json)
 */
export function loadFileConfig(options: LoadFileConfigOptions = {}): BatchQueueConfig {
	const target = options.target ?? "pi";
	const settings = TARGET_SETTINGS[target];
	const cwd = options.cwd ?? process.cwd();
	const packageConfig = readPackageJsonConfig(
		options.packageJsonPath ?? defaultPackageJsonPath(),
		settings.section,
	);
	const projectConfig = readConfigFile(
		options.projectConfigPath ?? path.join(cwd, settings.projectConfigRelative),
	);

	return mergeFileConfigs(packageConfig, projectConfig);
}

/** @deprecated Use loadFileConfig({ target: "opencode", ... }). */
export type LoadOpenCodeFileConfigOptions = Omit<LoadFileConfigOptions, "target">;

export function loadOpenCodeFileConfig(
	options: LoadOpenCodeFileConfigOptions = {},
): BatchQueueConfig {
	return loadFileConfig({ ...options, target: "opencode" });
}

function mergeFileConfigs(
	packageConfig: BatchQueueConfig,
	projectConfig: BatchQueueConfig,
): BatchQueueConfig {
	return {
		...packageConfig,
		...projectConfig,
		...(projectConfig.pathSecurity || packageConfig.pathSecurity
			? {
				pathSecurity: {
					...packageConfig.pathSecurity,
					...projectConfig.pathSecurity,
				},
			}
			: {}),
	};
}
