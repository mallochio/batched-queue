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
}

export interface PathValidationResult {
	allowed: boolean;
	reason?: string;
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

/** Validate an already-resolved absolute path against security policy. */
export function validateResolvedPath(
	resolvedPath: string,
	config: PathSecurityConfig,
	gitWorkspaceRoot: string,
): PathValidationResult {
	if (config.blockSensitivePaths && isSensitivePath(resolvedPath)) {
		return {
			allowed: false,
			reason: `access blocked: ${resolvedPath} is a sensitive system path (credentials, keys, or system config)`,
			resolvedPath,
		};
	}

	const allowedPaths = [gitWorkspaceRoot, ...config.allowedPaths];
	const withinAllowed = isWithinAllowedPath(resolvedPath, allowedPaths);

	if (!withinAllowed && !config.allowOutsideWorkspace) {
		return {
			allowed: false,
			reason: `path outside workspace: ${resolvedPath}\nworkspace root: ${gitWorkspaceRoot}\nset allowOutsideWorkspace: true in config to allow`,
			resolvedPath,
		};
	}

	return {
		allowed: true,
		resolvedPath,
	};
}

export const DEFAULT_PATH_SECURITY: PathSecurityConfig = {
	allowOutsideWorkspace: false,
	allowedPaths: [],
	blockSensitivePaths: true,
};

export function createPathValidator(
	config: Partial<PathSecurityConfig> = {},
	gitWorkspaceRoot?: string,
) {
	const merged = { ...DEFAULT_PATH_SECURITY, ...config };

	const validate = (filePath: string, cwd: string) => {
		const resolved = path.resolve(cwd, filePath);
		const root = gitWorkspaceRoot ?? findWorkspaceRoot(cwd);
		return validateResolvedPath(resolved, merged, root);
	};

	return {
		validate,

		validateOrThrow: (filePath: string, cwd: string) => {
			const result = validate(filePath, cwd);
			if (!result.allowed) {
				throw new Error(result.reason);
			}
			return result;
		},
	};
}
