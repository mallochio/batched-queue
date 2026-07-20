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

Outcome classification is implemented in `parse-events.ts`:

- `timedOut` -> `timeout`;
- `!reachedAgentEnd` -> `provider_error`;
- `reachedAgentEnd && willRetry` -> `invalid`;
- otherwise the oracle result determines `pass` or `fail`.

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

The default oracle is `benchmarks/harness/oracles.ts` (`defaultOracle`). It
reads the proof spec from `.bench/proof/expected.json` and runs:

- `expectedSubstrings` checks against the final assistant text and every bash
  or batch tool output captured in `ParsedEvents.bashOutputs`;
- `reverifyCommand` executed in the fixture directory with an expected exit code
  (default `0`) and required output substrings;
- `forbiddenOutput` checks against `bashOutputs` to detect trailing actions
  after a deliberate failure;
- `noMutation` fixture-digest verification for read-only scenarios.

Oracles must be deterministic, side-effect bounded, and independent of
assistant wording. Proof files live under `.bench/proof/` and are excluded from
tracked fixture digests.

## Proof files

For every run `createFixture(scenarioId)` writes:

- `.bench/proof/expected.json` — the proof spec (`family`, `expectedSubstrings`,
  `reverifyCommand`, `expectedExitCode`, `reverifyOutputContains`,
  `forbiddenOutput`, `noMutation`);
- `.bench/proof/.digest` — the SHA-256 digest of the tracked fixture files,
  used when `noMutation` is true.

The scenario-to-proof mapping is in `benchmarks/harness/fixture.ts`
(`SCENARIO_PROOFS`).

## Scenario families

- Verify-family tasks (H1, H7, H20, H23): re-run `bash scripts/check.sh` and
  require the `VERIFY_OK token=VTOK-9C3` output plus the expected token in the
  agent text.
- Shell-state tasks (H2, H8, H18): re-run the nested `cd`, `BQ_VAR`, `pwd`, and
  `echo` sequence and require the expected `nested` directory and `STATE-88`
  value.
- Binding tasks (H3, H10, H19): re-run `sed` from `nested/state.txt` into
  `consumed:<marker>` and require that exact output.
- Failure-boundary tasks (H4, H12, H21): re-run `bash scripts/fail.sh`, expect
  exit code `3`, and forbid `VERIFY_OK` in any bash/batch output.
- Read-only tasks (H5, H6, H9, H13, H14, H15, H16, H17, H22, H24): re-read the
  relevant fixture files and compare the expected values to the agent text.
- Test tasks (H11, H15): re-run `bun test tests/config-loader.test.ts` and
  expect exit code `0` plus a passing result.
- No-mutation task (H23): in addition to the verify check, recompute the fixture
  digest ignoring `.bench/proof` and compare it to `.bench/proof/.digest`.

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
