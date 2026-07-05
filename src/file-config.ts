import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { BatchQueueConfig, ModelRef } from "./config.js";
import { parseModelRefString } from "./config.js";

const PI_PROJECT_CONFIG_RELATIVE = path.join(".pi", "batched-queue.json");
const OPENCODE_PROJECT_CONFIG_RELATIVE = path.join(".opencode", "batched-queue.json");

export const PI_PROJECT_CONFIG_PATH = PI_PROJECT_CONFIG_RELATIVE;
export const OPENCODE_PROJECT_CONFIG_PATH = OPENCODE_PROJECT_CONFIG_RELATIVE;

export interface BatchQueueJsonConfig {
	readonly maxBatchActions?: number;
	readonly executorModel?: string | ModelRef;
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

	const executorModel = parseModelRefValue(raw.executorModel);
	if (executorModel) {
		config.executorModel = executorModel;
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

function readPiPackageJsonConfig(packageJsonPath: string): BatchQueueConfig {
	return readPackageJsonConfig(packageJsonPath, "pi");
}

function readOpenCodePackageJsonConfig(packageJsonPath: string): BatchQueueConfig {
	return readPackageJsonConfig(packageJsonPath, "opencode");
}

export interface LoadFileConfigOptions {
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
 * 1. package.json → pi.batchQueue (package defaults)
 * 2. .pi/batched-queue.json in cwd (project override)
 */
export function loadFileConfig(options: LoadFileConfigOptions = {}): BatchQueueConfig {
	const cwd = options.cwd ?? process.cwd();
	const packageConfig = readPiPackageJsonConfig(
		options.packageJsonPath ?? defaultPackageJsonPath(),
	);
	const projectConfig = readConfigFile(
		options.projectConfigPath ?? path.join(cwd, PI_PROJECT_CONFIG_RELATIVE),
	);

	return mergeFileConfigs(packageConfig, projectConfig);
}

export interface LoadOpenCodeFileConfigOptions {
	readonly cwd?: string;
	readonly packageJsonPath?: string;
	readonly projectConfigPath?: string;
}

/**
 * Load batched-queue settings for OpenCode from JSON files.
 *
 * Precedence within file sources (later wins):
 * 1. package.json → opencode.batchQueue (package defaults)
 * 2. .opencode/batched-queue.json in cwd (project override)
 */
export function loadOpenCodeFileConfig(
	options: LoadOpenCodeFileConfigOptions = {},
): BatchQueueConfig {
	const cwd = options.cwd ?? process.cwd();
	const packageConfig = readOpenCodePackageJsonConfig(
		options.packageJsonPath ?? defaultPackageJsonPath(),
	);
	const projectConfig = readConfigFile(
		options.projectConfigPath ?? path.join(cwd, OPENCODE_PROJECT_CONFIG_RELATIVE),
	);

	return mergeFileConfigs(packageConfig, projectConfig);
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
