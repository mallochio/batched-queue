import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { BatchQueueConfig, ModelRef } from "./config.js";
import { parseModelRefString } from "./config.js";

const PROJECT_CONFIG_RELATIVE = path.join(".pi", "batched-queue.json");

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

function readPackageJsonConfig(packageJsonPath: string): BatchQueueConfig {
	if (!fs.existsSync(packageJsonPath)) {
		return {};
	}
	const raw = readJsonFile(packageJsonPath);
	if (!isRecord(raw) || !isRecord(raw.pi)) {
		return {};
	}
	return parseBatchQueueJsonConfig(raw.pi.batchQueue);
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
	const packageConfig = readPackageJsonConfig(
		options.packageJsonPath ?? defaultPackageJsonPath(),
	);
	const projectConfig = readConfigFile(
		options.projectConfigPath ?? path.join(cwd, PROJECT_CONFIG_RELATIVE),
	);

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
