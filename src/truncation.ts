/**
 * Describes how a captured stream or line collection was truncated
 * before being returned to the model.
 */
export interface TruncationBoundary {
	readonly truncated: boolean;
	/** Total units (lines or characters) before truncation. */
	readonly totalUnits: number;
	/** Units retained from the start of the stream. */
	readonly headUnits: number;
	/** Units retained from the end of the stream. */
	readonly tailUnits: number;
	/** Units omitted between head and tail segments. */
	readonly omittedUnits: number;
}

export type TruncationUnit = "lines" | "chars";

export interface TruncationInfo extends TruncationBoundary {
	readonly unit: TruncationUnit;
}

/** Head/tail segments for structured rendering of truncated output. */
export interface TruncatedSegments<T> {
	readonly head: readonly T[];
	readonly tail: readonly T[];
	readonly truncation: TruncationInfo;
}

export interface CapturedStream {
	readonly text: string;
	readonly truncation?: TruncationInfo;
}
