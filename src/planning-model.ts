import type { ModelRef, ResolvedBatchQueueConfig } from "./config.js";

/**
 * Model that turns an `objective` into a concrete action batch.
 * Defaults to the session driver / planner; optional configured model overrides
 * with a cheaper one for that step only.
 */
export function resolvePlanningModelRef(
	driverModel: ModelRef,
	config: ResolvedBatchQueueConfig,
): ModelRef {
	return config.executorModel ?? driverModel;
}

export function planningModelDescription(
	driverModel: ModelRef,
	config: ResolvedBatchQueueConfig,
): string {
	if (config.executorModel) {
		return `${config.executorModel.provider}/${config.executorModel.id} (configured execution model; session driver ${driverModel.provider}/${driverModel.id} replans)`;
	}
	return `${driverModel.provider}/${driverModel.id} (session driver / planner)`;
}

export function configuredExecutionModelDescription(
	config: ResolvedBatchQueueConfig,
): string {
	if (config.executorModel) {
		return `${config.executorModel.provider}/${config.executorModel.id} (configured execution model for objective batches)`;
	}
	return "not configured (objective batches use session driver / planner)";
}
