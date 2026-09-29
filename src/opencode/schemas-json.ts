import type { ResolvedBatchQueueConfig } from "../config.js";
import { createBatchQueueToolParameters } from "../analyzer.js";

/**
 * OpenCode V2 tool input schemas are JSON Schema (or Effect Schema).
 * Reuse the TypeBox tool parameter object, which is already JSON-Schema shaped.
 */
export function createBatchQueueJsonSchema(
	config: ResolvedBatchQueueConfig,
): Record<string, unknown> {
	return structuredClone(
		createBatchQueueToolParameters(config.maxBatchActions),
	) as Record<string, unknown>;
}
