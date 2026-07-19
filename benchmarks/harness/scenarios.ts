// Scenario and condition definitions for the Pi headless benchmark.
//
// Prompts are identical across conditions except for the appended
// tool-selection instruction, per the benchmark reporting rules.

import { MARKERS } from "./fixture.ts";
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
];

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
