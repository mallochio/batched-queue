/**
 * OpenCode package entry: dual V1 + V2 support from one default export.
 *
 * - V1 (OpenCode 1.x / `@opencode-ai/plugin`): calls `server()`
 * - V2 (OpenCode 2.x / `@opencode/plugin`): reads `id` + `setup()` from Plugin.define
 *
 * See https://opencode.ai/v2/docs/build/plugins/migrate-v1#support-v1-and-v2-from-one-package
 */

import { BatchedQueuePlugin } from "./plugin.js";
import { BatchedQueueV2Plugin } from "./plugin-v2.js";

export { BatchedQueuePlugin, registerBatchedQueueOpenCodePlugin } from "./plugin.js";
export { BatchedQueueV2Plugin, createBatchedQueueV2Plugin } from "./plugin-v2.js";

export default {
	...BatchedQueueV2Plugin,
	async server(input: Parameters<typeof BatchedQueuePlugin>[0]) {
		return BatchedQueuePlugin(input);
	},
};
