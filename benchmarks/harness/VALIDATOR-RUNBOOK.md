# Validator runbook

## Purpose

Use fixture-owned proof artifacts and deterministic re-checks as the source of
truth for benchmark success. Do not decide correctness from the final assistant
message.

## Outcome taxonomy

Each run must have exactly one outcome:

- `pass`: all required oracle checks pass;
- `fail`: the agent completed but one or more oracle checks failed;
- `timeout`: the process exceeded the configured timeout;
- `provider_error`: authentication, model, quota, or provider request failure;
- `invalid`: the run violated the benchmark contract or produced unusable
  artifacts.

Timeouts and provider errors remain in the denominator for operational
reporting, but success rate should also expose the valid-run denominator.

## Oracle contract

An oracle receives:

```ts
type OracleContext = {
  fixtureDir: string;
  expected: FixtureExpectations;
  parsed: ParsedEvents;
  timedOut: boolean;
  readFixtureFile(path: string): string | null;
  reverify(command: string, timeoutMs: number): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
};

type OracleResult = {
  passed: boolean;
  checks: Record<string, boolean>;
  note?: string;
};
```

Oracles must be deterministic, side-effect bounded, and independent of
assistant wording. Proof files should live under `.bench/proof/`, which is
excluded from tracked fixture digests.

## Scenario families

- Verify-family tasks: require a proof JSON containing the fixture nonce and a
  successful focused test re-run.
- Shell-state tasks: require a proof containing the expected nested cwd and
  shell variable.
- Binding tasks: require a proof containing the expected bound marker and a
  successful consumer command.
- Failure-boundary tasks: require the failing check to occur and require that
  trailing actions did not run.
- Read-only tasks: require the expected file/line digest and no mutation.

The exact scenario mapping belongs in `scenarios.ts`; this document defines the
contract, not a second source of truth.

## Validation

Run:

```bash
bun test
bun run typecheck
```

Before external runs, add a held-out fixture seed and verify that all three
conditions receive equal permissions.
