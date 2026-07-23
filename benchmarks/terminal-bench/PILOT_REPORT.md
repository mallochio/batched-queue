# Terminal-Bench 2.1 paired pilot

- Dataset commit: `36d417f56c293b8271b306a0e4c566f58e98c153`
- Pi: `0.80.3`
- Harbor: `0.20.0`
- Model: `azure-openai-responses/gpt-5.6-luna`, thinking `high`
- Seed: `42`
- Episodes: 3 tasks × 2 neutral tool-availability conditions
- Raw artifact: `benchmarks/results/terminal-bench/pilot-20260721T114236Z/` (gitignored)
- Status: **pilot complete**; full 89-pair run remains incomplete — see
  [`../PUBLICATION_READINESS.md`](../PUBLICATION_READINESS.md)

| Task | Condition | Pass | Agent s | Turns | Tool calls | Batch actions | Tokens¹ | Cost |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| fix-git | batch | 1 | 53.71 | 9 | 10 | 3 | 62,602 | $0.1147 |
| fix-git | native | 1 | 62.25 | 12 | 20 | 0 | 108,402 | $0.1480 |
| modernize-scientific-stack | batch | 1 | 42.64 | 5 | 4 | 7 | 25,837 | $0.0619 |
| modernize-scientific-stack | native | 1 | 46.14 | 9 | 13 | 0 | 37,091 | $0.0676 |
| nginx-request-logging | batch | 1 | 54.44 | 4 | 3 | 0 | 18,610 | $0.0649 |
| nginx-request-logging | native | 1 | 67.15 | 9 | 11 | 0 | 50,483 | $0.1124 |

¹ Input plus output tokens; cache-read tokens are included in Harbor's input total.

## Paired batch-minus-native differences

| Task | Pass | Agent s | Turns | Tool calls | Tokens | Cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| fix-git | 0 | -8.54 | -3 | -10 | -45,800 | -$0.0333 |
| modernize-scientific-stack | 0 | -3.50 | -4 | -9 | -11,254 | -$0.0058 |
| nginx-request-logging | 0 | -12.72 | -5 | -8 | -31,873 | -$0.0474 |

All six episodes passed the official verifier with no provider or harness errors.
The batch-available agent invoked `batch_queue` on two of three tasks;
`modernize-scientific-stack` included batches of four and three actions.
`nginx-request-logging` did not invoke it, so that pair measures stochastic
variation under tool availability rather than batch execution.

This pilot validates the harness and supports proceeding to the frozen external
run. It is too small for an effectiveness or significance claim. Total observed
cost was `$0.569548`; a linear 178-episode projection is about `$16.90`, but the
full suite contains harder and longer tasks, so use a higher stop-loss budget.
