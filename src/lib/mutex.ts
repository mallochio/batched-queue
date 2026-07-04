/**
 * per-path async mutex for apply_diff file operations.
 */

import * as path from "node:path";

const locks = new Map<string, Promise<void>>();

export async function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
	const key = path.resolve(filePath);

	while (locks.has(key)) {
		await locks.get(key);
	}

	let resolve!: () => void;
	const promise = new Promise<void>((r) => {
		resolve = r;
	});
	locks.set(key, promise);

	try {
		return await fn();
	} finally {
		locks.delete(key);
		resolve();
	}
}
