#!/usr/bin/env python3
"""Train an instruction-only mode classifier on the discordance ledger.

Labels come from ``preferred_oracle_mode`` (batch=1, native=0). Features are
instruction text only. Concordant tasks plus 70% of discordant tasks form the
train set; the remaining ~30% of discordant tasks are the holdout gate set.
The fitted sklearn pipeline is serialized to ``artifact.pkl`` and split metadata
to ``artifact.json``.
"""

from __future__ import annotations

import argparse
import json
import joblib
import random
from pathlib import Path

import numpy as np
from sklearn.metrics import accuracy_score

from benchmarks.mode_router.classifier import CombinedPipeline
from benchmarks.mode_router.features import structural_feature_rows

LEDGER_PATH = Path(__file__).parents[1] / "terminal-bench" / "discordance_ledger.json"
DEFAULT_OUTPUT = Path(__file__).parent / "artifacts" / "classifier_v1"


def build_dataset(ledger_data: dict) -> tuple[list, list, list]:
    tasks = ledger_data.get("tasks", {})
    ids, texts, labels = [], [], []
    for task_id, info in tasks.items():
        inst = (info.get("instruction") or "").strip()
        if not inst:
            continue
        preferred = info.get("preferred_oracle_mode", "native")
        ids.append(task_id)
        texts.append(inst)
        labels.append(1 if preferred == "batch" else 0)
    return ids, texts, labels


def _build_input(texts: list[str], idx: list[int]) -> tuple:
    """Return (texts list, structural matrix) for the given indices."""
    sample = [texts[i] for i in idx]
    struct_matrix = np.asarray(structural_feature_rows(sample), dtype=float)
    return sample, struct_matrix


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ledger", type=Path, default=LEDGER_PATH)
    parser.add_argument("--holdout-seed", type=int, default=42)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--gate-json", type=Path, default=Path("/tmp/l1_gate.json"))
    parser.add_argument("--max-features", type=int, default=50)
    args = parser.parse_args()

    if not args.ledger.exists():
        raise SystemExit(f"Ledger not found: {args.ledger}")

    ledger = json.loads(args.ledger.read_text(encoding="utf-8"))
    ids, texts, labels = build_dataset(ledger)

    tasks = ledger.get("tasks", {})
    discordant_ids = {t for t, i in tasks.items() if i["mode"] in ("batch_only", "native_only")}

    rng = random.Random(args.holdout_seed)
    discordant_idxs = [i for i in range(len(ids)) if ids[i] in discordant_ids]
    rng.shuffle(discordant_idxs)
    k = max(1, round(len(discordant_idxs) * 0.3))
    holdout_idx = set(discordant_idxs[:k])
    train_idx = [i for i in range(len(ids)) if i not in holdout_idx]
    holdout_idx = sorted(holdout_idx)

    X_train_text, X_train_struct = _build_input(texts, train_idx)
    y_train = [labels[i] for i in train_idx]
    X_hold_text, X_hold_struct = _build_input(texts, holdout_idx)
    y_hold = [labels[i] for i in holdout_idx]
    holdout_ids = [ids[i] for i in holdout_idx]

    model = CombinedPipeline(max_features=args.max_features)
    model.fit(X_train_text, X_train_struct, y_train)

    acc_train = accuracy_score(y_train, model.predict(X_train_text, X_train_struct))
    acc_hold = accuracy_score(y_hold, model.predict(X_hold_text, X_hold_struct)) if holdout_idx else None

    args.output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, args.output.with_suffix(".pkl"))

    artifact = {
        "version": "classifier_v1",
        "holdout_seed": args.holdout_seed,
        "max_features": args.max_features,
        "model_file": args.output.with_suffix(".pkl").name,
        "train_ids": [ids[i] for i in train_idx],
        "holdout_ids": holdout_ids,
        "train_accuracy": acc_train,
        "holdout_accuracy": acc_hold,
    }
    args.output.with_suffix(".json").write_text(json.dumps(artifact, indent=2), encoding="utf-8")

    print(f"Train samples: {len(train_idx)} (batch={sum(y_train)}, native={len(y_train)-sum(y_train)})")
    print(f"Holdout discordant: {len(holdout_idx)} (batch={sum(y_hold)}, native={len(y_hold)-sum(y_hold)})")
    print(f"Train accuracy: {acc_train:.3f}| Holdout accuracy: {acc_hold:.3f}" if acc_hold is not None else f"Train accuracy: {acc_train:.3f}")
    print(f"Holdout task ids: {','.join(holdout_ids)}")

    # The authoritative L1 gate (gap_closed / utility) is computed via eval_slice
    # on the 24-slice. Here we record holdout accuracy as a a sanity signal only.
    gate = {
        "verdict": "PENDING",
        "note": "Holdout accuracy recorded; authoritative L1 gate computed via eval_slice --strategy classifier",
        "holdout_accuracy": acc_hold,
        "holdout_n": len(holdout_idx),
        "artifact_json": args.output.with_suffix(".json").as_posix(),
        "artifact_pkl": args.output.with_suffix(".pkl").as_posix(),
    }
    args.gate_json.write_text(json.dumps(gate, indent=2), encoding="utf-8")
    print(f"Wrote gate-json (PENDING) to {args.gate_json}")
    print(f"Saved model to {args.output.with_suffix('.pkl')} and metadata to {args.output.with_suffix('.json')}")


if __name__ == "__main__":
    main()
