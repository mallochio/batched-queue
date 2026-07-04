import type { DiffMatchStrategy } from "../results.js";
import { normalizeForDiffMatch } from "./normalize.js";

export interface DiffBlockMatch {
	readonly strategy: DiffMatchStrategy;
	readonly startLine: number;
	readonly matchedLineCount: number;
}

function splitLines(text: string): string[] {
	if (text.length === 0) return [];
	return text.split("\n");
}

export function findLineBlockMatch(
	fileLines: readonly string[],
	searchText: string,
): DiffBlockMatch | null {
	const normalizedFileLines = fileLines.map((line) =>
		normalizeForDiffMatch(line).trimEnd(),
	);
	const searchLines = splitLines(normalizeForDiffMatch(searchText));
	if (searchLines.length === 0) return null;

	for (let start = 0; start <= normalizedFileLines.length - searchLines.length; start++) {
		let matched = true;
		for (let offset = 0; offset < searchLines.length; offset++) {
			if (normalizedFileLines[start + offset] !== searchLines[offset]) {
				matched = false;
				break;
			}
		}
		if (matched) {
			return {
				strategy: "sliding_window",
				startLine: start,
				matchedLineCount: searchLines.length,
			};
		}
	}

	return null;
}

export interface DiffLocateResult {
	readonly strategy: DiffMatchStrategy;
	readonly startLine: number;
	readonly matchedLineCount: number;
}

export function locateDiffBlock(
	content: string,
	oldText: string,
): DiffLocateResult | null {
	if (content.includes(oldText)) {
		const exactIndex = content.indexOf(oldText);
		const before = content.slice(0, exactIndex);
		const startLine = before.length === 0 ? 0 : before.split("\n").length - 1;
		return {
			strategy: "exact",
			startLine,
			matchedLineCount: splitLines(oldText).length,
		};
	}

	const normalizedContent = normalizeForDiffMatch(content);
	const normalizedOld = normalizeForDiffMatch(oldText);
	if (normalizedContent.includes(normalizedOld)) {
		const fileLines = splitLines(content);
		const block = findLineBlockMatch(fileLines, oldText);
		if (block) {
			return {
				strategy: "normalized",
				startLine: block.startLine,
				matchedLineCount: block.matchedLineCount,
			};
		}
	}

	const sliding = findLineBlockMatch(splitLines(content), oldText);
	return sliding;
}

export function applyDiffToContent(
	content: string,
	oldText: string,
	newText: string,
	replaceAll: boolean,
): { updated: string; match: DiffLocateResult } | null {
	if (content.includes(oldText)) {
		const occurrences = content.split(oldText).length - 1;
		if (!replaceAll && occurrences !== 1) return null;

		const before = content.slice(0, content.indexOf(oldText));
		const match: DiffLocateResult = {
			strategy: "exact",
			startLine: before.length === 0 ? 0 : before.split("\n").length - 1,
			matchedLineCount: splitLines(oldText).length,
		};
		const updated = replaceAll
			? content.split(oldText).join(newText)
			: content.replace(oldText, newText);
		return { updated, match };
	}

	const located = locateDiffBlock(content, oldText);
	if (!located) return null;

	const fileLines = splitLines(content);
	const occurrenceCount = countNormalizedOccurrences(
		fileLines,
		normalizeForDiffMatch(oldText),
	);
	if (!replaceAll && occurrenceCount !== 1) return null;

	if (replaceAll) {
		let current = content;
		let strategy = located.strategy;
		while (true) {
			const nextMatch = locateDiffBlock(current, oldText);
			if (!nextMatch) break;
			strategy = nextMatch.strategy;
			const nextLines = splitLines(current);
			current = [
				...nextLines.slice(0, nextMatch.startLine),
				...splitLines(newText),
				...nextLines.slice(nextMatch.startLine + nextMatch.matchedLineCount),
			].join("\n");
		}
		return { updated: current, match: { ...located, strategy } };
	}

	const updatedLines = [
		...fileLines.slice(0, located.startLine),
		...splitLines(newText),
		...fileLines.slice(located.startLine + located.matchedLineCount),
	];
	return { updated: updatedLines.join("\n"), match: located };
}

function countNormalizedOccurrences(
	fileLines: readonly string[],
	searchBlock: string,
): number {
	const searchLines = splitLines(searchBlock);
	if (searchLines.length === 0) return 0;

	const normalizedFileLines = fileLines.map((line) =>
		normalizeForDiffMatch(line).trimEnd(),
	);

	let count = 0;
	for (let start = 0; start <= normalizedFileLines.length - searchLines.length; start++) {
		let matched = true;
		for (let offset = 0; offset < searchLines.length; offset++) {
			if (normalizedFileLines[start + offset] !== searchLines[offset]) {
				matched = false;
				break;
			}
		}
		if (matched) {
			count++;
			start += searchLines.length - 1;
		}
	}
	return count;
}
