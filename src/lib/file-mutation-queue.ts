/**
 * Per-path mutation serialization that works across hosts.
 *
 * Pi exports `withFileMutationQueue` so extension writes interleave safely
 * with the host's own edits. Oh My Pi (omp) bundles a compatibility shim that
 * does not re-export it, and a static import of a missing named export fails
 * at module-load time, taking the whole extension down.
 *
 * So resolve the host helper lazily and fall back to a local per-path promise
 * chain. The fallback still serializes this extension's own writes; it just
 * cannot coordinate with host-side writes.
 */

type MutationFn = <T>(path: string, fn: () => Promise<T>) => Promise<T>;

const HOST_MODULES = ["@earendil-works/pi-coding-agent", "@oh-my-pi/pi-coding-agent"];

let resolved: MutationFn | undefined;

const localChains = new Map<string, Promise<unknown>>();

function localWithFileMutationQueue<T>(path: string, fn: () => Promise<T>): Promise<T> {
	const previous = localChains.get(path) ?? Promise.resolve();
	// Run fn regardless of whether the previous mutation resolved or rejected.
	const next = previous.then(fn, fn);
	// Track a rejection-proof tail so one failure cannot poison later waiters.
	const tail = next.catch(() => undefined);
	localChains.set(path, tail);
	void tail.then(() => {
		// Drop the entry once this is the last queued mutation for the path.
		if (localChains.get(path) === tail) localChains.delete(path);
	});
	return next;
}

async function resolveHostQueue(): Promise<MutationFn> {
	for (const specifier of HOST_MODULES) {
		try {
			const mod = (await import(specifier)) as Record<string, unknown>;
			const candidate = mod.withFileMutationQueue;
			if (typeof candidate === "function") return candidate as MutationFn;
		} catch {
			// Host module absent or not loadable under this runtime; try the next.
		}
	}
	return localWithFileMutationQueue;
}

export async function withFileMutationQueue<T>(path: string, fn: () => Promise<T>): Promise<T> {
	resolved ??= await resolveHostQueue();
	return resolved(path, fn);
}
