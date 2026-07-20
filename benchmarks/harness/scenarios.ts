// Scenario and condition definitions for the Pi headless benchmark.
//
// Prompts are identical across conditions except for the appended
// tool-selection instruction, per the benchmark reporting rules.

import { MARKERS } from "./fixture.ts";
import { defaultOracle } from "./oracles.ts";
import type { ConditionSpec, ScenarioSpec } from "./types.ts";

const norm = (s: string) => s.toLowerCase().replace(/[\s`*_]+/g, "");
const contains = (text: string, needle: string) =>
	norm(text).includes(norm(needle));

export const SCENARIOS: ScenarioSpec[] = [
	{
		id: "H1",
		label: "discover-inspect-verify",
		task: [
			"In this repository, locate the project configuration loader, inspect the",
			"relevant source lines, and run the smallest focused check that verifies",
			"the loader by running `bash scripts/check.sh`. Finish by reporting the",
			"exact verification marker line printed by the check. Do not edit files.",
		].join(" "),
		predicate: (t) =>
			contains(t, MARKERS.verifyOk) && contains(t, MARKERS.verifyToken),
	},
	{
		id: "H2",
		label: "persistent-shell-state",
		task: [
			"In this repository, change into the `nested` directory, set an",
			`environment variable BQ_VAR=${MARKERS.shellVar}, and then in a later`,
			"command print both the current working directory and $BQ_VAR. Report the",
			"printed directory and variable value. Do not edit files.",
		].join(" "),
		predicate: (t) => contains(t, MARKERS.shellVar) && contains(t, "nested"),
	},
	{
		id: "H3",
		label: "result-binding",
		task: [
			"Read the benchmark marker value from `nested/state.txt` (the value after",
			"BENCH_MARKER=), then run a later command `echo consumed:<value>` that uses",
			"that exact observed value. Report the echoed line. Do not edit files.",
		].join(" "),
		predicate: (t) => contains(t, `consumed:${MARKERS.benchMarker}`),
	},
	{
		id: "H4",
		label: "failure-boundary",
		task: [
			"Run the repository's deliberate failing check `bash scripts/fail.sh`.",
			"After it fails, do NOT perform any trailing command or recovery action.",
			"Report that the check failed and that you skipped the trailing step.",
		].join(" "),
		expectsHalt: true,
		predicate: (t) =>
			(contains(t, "fail") || contains(t, "exit")) && contains(t, "skip"),
	},
	{
		id: "H5",
		label: "one-action-read-control",
		task:
			"Read README.md and report its exact first-level heading. Do not edit files.",
		predicate: (t) => contains(t, "# fixture"),
	},
	{
		id: "H6",
		label: "two-step-search-read",
		task: [
			"Search for `verifyToken` in the repository, inspect the matching source",
			"line in src/config-loader.ts, and report the function name. Do not edit files.",
		].join(" "),
		predicate: (t) => contains(t, "verifyToken"),
	},
	{
		id: "H7",
		label: "four-step-config-check",
		task: [
			"Find the project configuration JSON, inspect its verifyToken field,",
			"locate the loader that returns it, run `bash scripts/check.sh`, and",
			"report the exact VERIFY_OK line. Do not edit files.",
		].join(" "),
		predicate: (t) =>
			contains(t, MARKERS.verifyOk) && contains(t, MARKERS.verifyToken),
	},
	{
		id: "H8",
		label: "eight-step-state-and-verification",
		task: [
			"Perform this dependent sequence without editing files: locate the config",
			"JSON; read its verifyToken; locate src/config-loader.ts; inspect the",
			"verifyToken function; change into nested; set BQ_VAR to",
			`${MARKERS.shellVar}; print the cwd and variable in a later command;`,
			"then run bash scripts/check.sh and report both the state output and the",
			"VERIFY_OK marker.",
		].join(" "),
		predicate: (t) =>
			contains(t, MARKERS.shellVar) &&
			contains(t, MARKERS.verifyOk) &&
			contains(t, MARKERS.verifyToken),
	},
	{
		id: "H9",
		label: "independent-read-control",
		task: [
			"Independently read README.md, nested/state.txt, and config/project.json.",
			"Report the fixture heading, BENCH_MARKER value, and verifyToken. Do not edit files.",
		].join(" "),
		predicate: (t) =>
			contains(t, "# fixture") &&
			contains(t, MARKERS.benchMarker) &&
			contains(t, MARKERS.verifyToken),
	},
	{
		id: "H10",
		label: "bound-marker-check",
		task: [
			"Read BENCH_MARKER from nested/state.txt, bind the observed value,",
			"echo it as consumed:<value>, then run bash scripts/check.sh and report",
			"both outputs. Do not edit files.",
		].join(" "),
		predicate: (t) =>
			contains(t, `consumed:${MARKERS.benchMarker}`) &&
			contains(t, MARKERS.verifyOk),
	},
	{
		id: "H11",
		label: "loader-source-and-test",
		task: [
			"Locate src/config-loader.ts, inspect its exported functions, locate the",
			"focused test that verifies verifyToken, run that focused test with bun,",
			"and report the test result. Do not edit files.",
		].join(" "),
		predicate: (t) => contains(t, "pass") || contains(t, "passed"),
	},
	{
		id: "H12",
		label: "failure-and-state-boundary",
		task: [
			"Run bash scripts/fail.sh and observe its failure. Do not run any command",
			"after the failure. Report the nonzero failure and explicitly state that",
			"the trailing verification step was skipped.",
		].join(" "),
		expectsHalt: true,
		predicate: (t) =>
			(contains(t, "fail") || contains(t, "nonzero")) && contains(t, "skip"),
	},
	{
		id: "H13",
		label: "config-value-read",
		task:
			"Read config/project.json, find the verifyToken property, and report its exact value. Do not edit files.",
		predicate: (t) => contains(t, MARKERS.verifyToken),
	},
	{
		id: "H14",
		label: "feature-import-trace",
		task: [
			"Locate src/feature.ts, inspect which function it imports from",
			"src/config-loader.ts, then report the imported function name. Do not edit files.",
		].join(" "),
		predicate: (t) => contains(t, "verifyToken"),
	},
	{
		id: "H15",
		label: "focused-test-run",
		task: [
			"Locate tests/config-loader.test.ts, inspect what it verifies, run",
			"`bun test tests/config-loader.test.ts`, and report whether the test passed.",
			"Do not edit files.",
		].join(" "),
		predicate: (t) => contains(t, "pass") || contains(t, "passed"),
	},
	{
		id: "H16",
		label: "readme-config-crosscheck",
		task: [
			"Read README.md and config/project.json, then report the README heading",
			"and the config name and verifyToken values. Do not edit files.",
		].join(" "),
		predicate: (t) =>
			contains(t, "# fixture") &&
			contains(t, "fixture") &&
			contains(t, MARKERS.verifyToken),
	},
	{
		id: "H17",
		label: "nested-state-inspection",
		task: [
			"Inspect nested/state.txt, then print the current repository directory",
			"and report both the BENCH_MARKER value and the directory. Do not edit files.",
		].join(" "),
		predicate: (t) => contains(t, MARKERS.benchMarker) && contains(t, "bq-fixture"),
	},
	{
		id: "H18",
		label: "shell-state-reuse",
		task: [
			"Change into nested, export BQ_VAR=STATE-88, print the working directory,",
			"then in a later command print BQ_VAR. Report both outputs. Do not edit files.",
		].join(" "),
		predicate: (t) => contains(t, MARKERS.shellVar) && contains(t, "nested"),
	},
	{
		id: "H19",
		label: "binding-and-check",
		task: [
			"Read BENCH_MARKER from nested/state.txt and bind it, consume that binding",
			"with `echo consumed:<value>`, then report the consumed marker. Do not edit files.",
		].join(" "),
		predicate: (t) => contains(t, `consumed:${MARKERS.benchMarker}`),
	},
	{
		id: "H20",
		label: "loader-check-sequence",
		task: [
			"Find src/config-loader.ts, inspect verifyToken, run `bash scripts/check.sh`,",
			"and report the exact successful verification line. Do not edit files.",
		].join(" "),
		predicate: (t) =>
			contains(t, MARKERS.verifyOk) && contains(t, MARKERS.verifyToken),
	},
	{
		id: "H21",
		label: "failed-check-report",
		task: [
			"Execute `bash scripts/fail.sh`, observe the nonzero result, and report",
			"that the deliberate check failed. Do not run a recovery command.",
		].join(" "),
		expectsHalt: true,
		predicate: (t) => contains(t, "fail") || contains(t, "nonzero"),
	},
	{
		id: "H22",
		label: "long-dependent-inspection",
		task: [
			"Complete this dependent read-only sequence: inspect README.md; locate",
			"config/project.json; read verifyToken; locate src/feature.ts; inspect its",
			"import; change into nested; read BENCH_MARKER; and report the heading,",
			"token, import, and marker.",
		].join(" "),
		predicate: (t) =>
			contains(t, "# fixture") &&
			contains(t, MARKERS.verifyToken) &&
			contains(t, "verifyToken") &&
			contains(t, MARKERS.benchMarker),
	},
	{
		id: "H23",
		label: "verification-no-mutation",
		task: [
			"Locate the project loader, inspect its source, run the focused check,",
			"and confirm the repository remains unmodified. Report VERIFY_OK and do not edit files.",
		].join(" "),
		predicate: (t) => contains(t, MARKERS.verifyOk),
	},
	{
		id: "H24",
		label: "config-version-report",
		task: [
			"Read config/project.json, inspect src/config-loader.ts, and report the",
			"config version and the exported loader function name. Do not edit files.",
		].join(" "),
		predicate: (t) => contains(t, "version") && contains(t, "loadConfig"),
	},
];

for (const scenario of SCENARIOS) {
	scenario.oracle = defaultOracle;
}

export const CONDITIONS: ConditionSpec[] = [
	{
		id: "native",
		label: "native-sequential",
		piArgs: ["--no-extensions", "--tools", "read,grep,bash"],
		toolInstruction:
			"Use the native read, grep, and bash tools, one dependent step at a time.",
	},
	{
		id: "batch-explicit",
		label: "batch-explicit",
		piArgs: [
			"--no-extensions",
			"-e",
			"__EXTENSION__",
			"--tools",
			"batch_queue",
		],
		toolInstruction:
			"Use the batch_queue tool with an explicit `actions` array containing the dependent steps. Do not use any other tool.",
	},
	{
		id: "batch-objective",
		label: "batch-objective",
		piArgs: [
			"--no-extensions",
			"-e",
			"__EXTENSION__",
			"--tools",
			"batch_queue",
		],
		toolInstruction:
			"Use the batch_queue tool with an `objective` string describing the goal; do not hand-author the actions array. Do not use any other tool.",
		env: {
			BATCH_QUEUE_EXECUTOR: process.env.BATCH_QUEUE_EXECUTOR ?? "openai/gpt-5.4-nano",
			BATCH_QUEUE_GROUNDING_TURNS: "3",
		},
	},
];

export function scenarioById(id: string): ScenarioSpec | undefined {
	return SCENARIOS.find((s) => s.id === id);
}

export function conditionById(id: string): ConditionSpec | undefined {
	return CONDITIONS.find((c) => c.id === id);
}
