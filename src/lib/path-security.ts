/**
 * path security — validates file paths to prevent unauthorized access.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface PathSecurityConfig {
	allowOutsideWorkspace: boolean;
	allowedPaths: string[];
	blockSensitivePaths: boolean;
	confirmPatterns: string[];
}

export interface PathValidationResult {
	allowed: boolean;
	reason?: string;
	requiresConfirmation?: boolean;
	resolvedPath: string;
}

const SENSITIVE_PATHS = [
	"/etc",
	"/var",
	"/root",
	"/System",
	"/Library/Preferences",
	"/Library/Keychains",
	path.join(os.homedir(), ".ssh"),
	path.join(os.homedir(), ".gnupg"),
	path.join(os.homedir(), ".config/gh"),
	path.join(os.homedir(), ".aws"),
	path.join(os.homedir(), ".kube"),
];

const SENSITIVE_FILENAMES = [
	"id_rsa",
	"id_ed25519",
	"id_ecdsa",
	"id_dsa",
	".pem",
	".key",
	"credentials",
	"credentials.json",
	"secrets.json",
	"token",
	".netrc",
];

export function findWorkspaceRoot(cwd: string): string {
	let current = path.resolve(cwd);
	while (true) {
		try {
			const gitPath = path.join(current, ".git");
			const stat = fs.statSync(gitPath);
			if (stat.isDirectory() || stat.isFile()) return current;
		} catch {
			// not found, keep walking
		}
		const parent = path.dirname(current);
		if (parent === current) return cwd;
		current = parent;
	}
}

function isWithinAllowedPath(resolved: string, allowedPaths: string[]): boolean {
	for (const allowed of allowedPaths) {
		const allowedResolved = path.resolve(allowed);
		if (resolved.startsWith(allowedResolved + path.sep) || resolved === allowedResolved) {
			return true;
		}
	}
	return false;
}

function isSensitivePath(resolved: string): boolean {
	for (const sensitive of SENSITIVE_PATHS) {
		if (resolved.startsWith(sensitive + path.sep) || resolved === sensitive) {
			return true;
		}
	}

	const basename = path.basename(resolved);
	for (const sensitive of SENSITIVE_FILENAMES) {
		if (basename === sensitive || basename.endsWith(sensitive)) {
			return true;
		}
	}

	return false;
}

function matchesConfirmPattern(resolved: string, patterns: string[]): boolean {
	for (const pattern of patterns) {
		const regex = globToRegex(pattern);
		if (regex.test(resolved)) return true;
	}
	return false;
}

function globToRegex(pattern: string): RegExp {
	const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	const withWildcards = escaped.replace(/\*/g, ".*");
	return new RegExp(`^${withWildcards}$`, "i");
}

export function validatePath(
	filePath: string,
	cwd: string,
	config: PathSecurityConfig,
): PathValidationResult {
	const resolved = path.resolve(cwd, filePath);

	if (config.blockSensitivePaths && isSensitivePath(resolved)) {
		return {
			allowed: false,
			reason: `access blocked: ${resolved} is a sensitive system path (credentials, keys, or system config)`,
			resolvedPath: resolved,
		};
	}

	const workspaceRoot = findWorkspaceRoot(cwd);
	const allowedPaths = [workspaceRoot, ...config.allowedPaths];
	const withinAllowed = isWithinAllowedPath(resolved, allowedPaths);

	if (!withinAllowed && !config.allowOutsideWorkspace) {
		return {
			allowed: false,
			reason: `path outside workspace: ${resolved}\nworkspace root: ${workspaceRoot}\nset allowOutsideWorkspace: true in config to allow`,
			resolvedPath: resolved,
		};
	}

	const requiresConfirmation = matchesConfirmPattern(resolved, config.confirmPatterns);

	return {
		allowed: true,
		requiresConfirmation,
		resolvedPath: resolved,
	};
}

export const DEFAULT_PATH_SECURITY: PathSecurityConfig = {
	allowOutsideWorkspace: false,
	allowedPaths: [],
	blockSensitivePaths: true,
	confirmPatterns: [
		"**/package.json",
		"**/Cargo.toml",
		"**/go.mod",
		"**/*.lock",
		"**/.gitignore",
	],
};

export function createPathValidator(config: Partial<PathSecurityConfig> = {}) {
	const merged = { ...DEFAULT_PATH_SECURITY, ...config };

	return {
		validate: (filePath: string, cwd: string) =>
			validatePath(filePath, cwd, merged),

		validateOrThrow: (filePath: string, cwd: string) => {
			const result = validatePath(filePath, cwd, merged);
			if (!result.allowed) {
				throw new Error(result.reason);
			}
			return result;
		},

		requiresConfirmation: (filePath: string, cwd: string) => {
			const result = validatePath(filePath, cwd, merged);
			return result.requiresConfirmation ?? false;
		},
	};
}
