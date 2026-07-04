/** Convert a simple glob pattern to a case-insensitive anchored regex. */
export function globToRegex(pattern: string): RegExp {
	const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	const withWildcards = escaped.replace(/\*/g, ".*");
	return new RegExp(`^${withWildcards}$`, "i");
}
