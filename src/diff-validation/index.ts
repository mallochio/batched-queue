import type { ApplyDiffAction } from "../actions.js";
import type { DiffMatchStrategy } from "../results.js";
import { detectLineEnding, restoreLineEndings } from "./normalize.js";
import { applyDiffToContent } from "./sliding-window.js";
import { validateSyntax } from "./syntax-router.js";

export interface DiffValidationSuccess {
	readonly ok: true;
	readonly updatedContent: string;
	readonly matchStrategy: DiffMatchStrategy;
}

export interface DiffValidationFailure {
	readonly ok: false;
	readonly errors: readonly string[];
}

export type DiffValidationOutcome = DiffValidationSuccess | DiffValidationFailure;

/**
 * Full Milestone 3 pipeline: structural match → syntactic sanity → ready to persist.
 */
export function validateAndPrepareDiff(
	filePath: string,
	content: string,
	action: Pick<ApplyDiffAction, "oldText" | "newText" | "replaceAll">,
): DiffValidationOutcome {
	const applied = applyDiffToContent(
		content,
		action.oldText,
		action.newText,
		action.replaceAll ?? false,
	);

	if (!applied) {
		return {
			ok: false,
			errors: [
				"oldText not found after exact, normalized, and sliding-window matching",
			],
		};
	}

	const ending = detectLineEnding(content);
	const updatedContent = restoreLineEndings(applied.updated, ending);
	const syntaxErrors = validateSyntax(filePath, updatedContent);

	if (syntaxErrors.length > 0) {
		return {
			ok: false,
			errors: syntaxErrors.map((message) => `syntax validation failed: ${message}`),
		};
	}

	return {
		ok: true,
		updatedContent,
		matchStrategy: applied.match.strategy,
	};
}

export { normalizeForDiffMatch } from "./normalize.js";
export { applyDiffToContent, locateDiffBlock } from "./sliding-window.js";
export { routeSyntaxLanguage, validateSyntax } from "./syntax-router.js";
