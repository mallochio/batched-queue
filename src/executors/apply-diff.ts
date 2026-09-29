import * as fs from "node:fs";
import type { ApplyDiffAction } from "../actions";
import type { ApplyDiffActionResult } from "../results";
import { resolveAndValidatePath } from "../capture";
import { validateAndPrepareDiff } from "../diff-validation";
import { withFileMutationQueue } from "../lib/file-mutation-queue";
import type { PathSecurityConfig } from "../lib/path-security";

export interface ApplyDiffExecutionContext {
	readonly workspaceRoot: string;
	readonly gitWorkspaceRoot: string;
	readonly pathSecurity?: PathSecurityConfig;
}

export async function executeApplyDiff(
	action: ApplyDiffAction,
	index: number,
	ctx: ApplyDiffExecutionContext,
): Promise<ApplyDiffActionResult> {
	const started = Date.now();
	const pathResult = resolveAndValidatePath(
		action.path,
		ctx.workspaceRoot,
		ctx.pathSecurity,
		ctx.gitWorkspaceRoot,
	);
	if (!pathResult.allowed) {
		return {
			index,
			type: "apply_diff",
			success: false,
			exitCode: 1,
			durationMs: Date.now() - started,
			error: pathResult.reason ?? "path not allowed",
			haltReason: "action_error",
			path: action.path,
			applied: false,
			bytesBefore: 0,
			bytesAfter: 0,
		};
	}

	const absolutePath = pathResult.resolvedPath;

	return withFileMutationQueue(absolutePath, async () => {
		if (!fs.existsSync(absolutePath)) {
			return {
				index,
				type: "apply_diff",
				success: false,
				exitCode: 1,
				durationMs: Date.now() - started,
				error: `file not found: ${action.path}`,
				haltReason: "action_error",
				path: action.path,
				applied: false,
				bytesBefore: 0,
				bytesAfter: 0,
				validationErrors: [`file not found: ${action.path}`],
			};
		}

		const original = fs.readFileSync(absolutePath, "utf8");
		const bytesBefore = Buffer.byteLength(original, "utf8");

		const validation = validateAndPrepareDiff(absolutePath, original, action);
		if (!validation.ok) {
			return {
				index,
				type: "apply_diff",
				success: false,
				exitCode: 1,
				durationMs: Date.now() - started,
				error: validation.errors[0],
				haltReason: "validation_failed",
				path: action.path,
				applied: false,
				bytesBefore,
				bytesAfter: bytesBefore,
				validationErrors: validation.errors,
			};
		}

		fs.writeFileSync(absolutePath, validation.updatedContent, "utf8");
		const bytesAfter = Buffer.byteLength(validation.updatedContent, "utf8");

		return {
			index,
			type: "apply_diff",
			success: true,
			exitCode: 0,
			durationMs: Date.now() - started,
			path: action.path,
			applied: true,
			matchStrategy: validation.matchStrategy,
			bytesBefore,
			bytesAfter,
		};
	});
}
