"""Loading Terminal-Bench task instructions from the pinned dataset checkout."""

from __future__ import annotations

from pathlib import Path

TB_TASKS_ROOT = Path(".cache/terminal-bench-2-1/tasks")


def load_instruction(task_id: str, tasks_root: Path = TB_TASKS_ROOT) -> str:
    """Load the raw `instruction.md` text for a Terminal-Bench task."""
    path = tasks_root / task_id / "instruction.md"
    if not path.exists():
        raise FileNotFoundError(f"Missing instruction for {task_id}: {path}")
    return path.read_text(encoding="utf-8").strip()
