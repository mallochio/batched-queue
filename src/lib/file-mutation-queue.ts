/** Serializes writes per path so two batches cannot interleave edits to the same file. */

const chains = new Map<string, Promise<unknown>>();

export function withFileMutationQueue<T>(path: string, fn: () => Promise<T>): Promise<T> {
	const previous = chains.get(path) ?? Promise.resolve();
	// Run fn regardless of whether the previous mutation resolved or rejected.
	const next = previous.then(fn, fn);
	// Track a rejection-proof tail so one failure cannot poison later waiters.
	const tail = next.catch(() => undefined);
	chains.set(path, tail);
	void tail.then(() => {
		if (chains.get(path) === tail) chains.delete(path);
	});
	return next;
}
