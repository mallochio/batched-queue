/**
 * permission evaluation for batched execute_bash actions.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { globToRegex } from "./glob.js";

export type PermissionAction = "allow" | "reject" | "ask";

export interface PermissionRule {
	tool: string;
	matches?: { cmd?: string | string[]; path?: string | string[] };
	action: PermissionAction;
	message?: string;
	approvedPatterns?: string[];
}

export interface PermissionVerdict {
	action: PermissionAction;
	message?: string;
	confirmationPrompt?: string;
}

let askCallback: ((prompt: string) => Promise<boolean>) | null = null;

export function registerAskCallback(callback: (prompt: string) => Promise<boolean>): void {
	askCallback = callback;
}

export function unregisterAskCallback(): void {
	askCallback = null;
}

function matchesAnyPattern(value: string, patterns: string | string[]): boolean {
	const arr = Array.isArray(patterns) ? patterns : [patterns];
	return arr.some((p) => globToRegex(p).test(value));
}

export function evaluatePermission(
	toolName: string,
	params: { cmd?: string; path?: string },
	rules: PermissionRule[],
): PermissionVerdict {
	for (const rule of rules) {
		if (!globToRegex(rule.tool).test(toolName)) continue;

		if (rule.matches?.cmd) {
			if (!matchesAnyPattern(params.cmd ?? "", rule.matches.cmd)) continue;
		}

		if (rule.matches?.path) {
			if (!matchesAnyPattern(params.path ?? "", rule.matches.path)) continue;
		}

		if (rule.action === "ask") {
			return {
				action: "ask",
				message: rule.message,
				confirmationPrompt: buildConfirmationPrompt(toolName, params, rule),
			};
		}

		return { action: rule.action, message: rule.message };
	}

	return { action: "allow" };
}

function buildConfirmationPrompt(
	toolName: string,
	params: { cmd?: string; path?: string },
	rule: PermissionRule,
): string {
	const parts: string[] = ["⚠️  Permission Required"];

	if (rule.message) {
		parts.push(rule.message);
	}

	parts.push("", `Tool: ${toolName}`);

	if (params.cmd) {
		const cmd = params.cmd.length > 100 ? params.cmd.slice(0, 100) + "..." : params.cmd;
		parts.push(`Command: ${cmd}`);
	}

	if (params.path) {
		parts.push(`Path: ${params.path}`);
	}

	parts.push("", "Proceed? [y/N]");
	return parts.join("\n");
}

export async function evaluatePermissionAsync(
	toolName: string,
	params: { cmd?: string; path?: string },
	rules: PermissionRule[],
): Promise<PermissionVerdict> {
	const verdict = evaluatePermission(toolName, params, rules);

	if (verdict.action !== "ask") {
		return verdict;
	}

	if (!askCallback) {
		return {
			action: "reject",
			message: `confirmation required but no ask callback registered. ${verdict.message ?? ""}`,
		};
	}

	const approved = await askCallback(verdict.confirmationPrompt ?? "Proceed?");

	return approved
		? { action: "allow" }
		: { action: "reject", message: "user declined permission request" };
}

const PERMISSIONS_PATH = path.join(os.homedir(), ".pi", "agent", "permissions.json");

export function loadPermissions(): PermissionRule[] {
	try {
		const raw = fs.readFileSync(PERMISSIONS_PATH, "utf-8");
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed;
	} catch {
		return [];
	}
}
