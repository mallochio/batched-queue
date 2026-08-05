"""Harbor agent that runs the pinned Pi CLI with optional batch_queue support."""

from __future__ import annotations

import hashlib
import json
import os
import shlex
import tarfile
import tempfile
from pathlib import Path
from typing import override

from harbor.agents.installed.base import with_prompt_template
from harbor.agents.installed.pi import Pi
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext

from benchmarks.mode_router.policy import ModePolicy

PI_VERSION = "0.80.3"
BUN_VERSION = "1.3.14"
EXTENSION_DIR = "/tmp/batched-queue-extension"


def condition_flags(condition: str) -> str:
    if condition not in {"native", "batch"}:
        raise ValueError("condition must be 'native' or 'batch'")
    flags = "--no-session --no-extensions --no-context-files --approve"
    if condition == "batch":
        flags += f" -e {EXTENSION_DIR}/src/extension.ts"
    return flags


class BatchedQueuePi(Pi):
    """The same Pi agent in both conditions; batch only adds the extension."""

    SUPPORTS_RESUME = False

    def __init__(
        self,
        *args,
        condition: str = "native",
        policy_strategy: str = "static",
        policy_artifact: str | None = None,
        extension_root: str | None = None,
        **kwargs,
    ) -> None:
        if policy_strategy == "static":
            condition_flags(condition)  # validate before creating the agent
        self.condition = condition
        self.policy_strategy = policy_strategy
        self.policy_artifact = policy_artifact
        self.extension_root = Path(extension_root or Path(__file__).parents[1]).resolve()
        super().__init__(*args, version=PI_VERSION, **kwargs)

    @staticmethod
    @override
    def name() -> str:
        return "batched-queue-pi"

    def _extension_files(self) -> list[Path]:
        files = [
            self.extension_root / "package.json",
            self.extension_root / "bun.lock",
            self.extension_root / "tsconfig.json",
        ]
        files.extend(sorted((self.extension_root / "src").rglob("*")))
        files = [path for path in files if path.is_file()]
        if not files or any(not path.exists() for path in files[:3]):
            raise FileNotFoundError(f"incomplete extension source at {self.extension_root}")
        return files

    def _source_digest(self, files: list[Path]) -> str:
        digest = hashlib.sha256()
        for path in files:
            relative = path.relative_to(self.extension_root).as_posix()
            digest.update(relative.encode())
            digest.update(path.read_bytes())
        return digest.hexdigest()

    @override
    async def install(self, environment: BaseEnvironment) -> None:
        await super().install(environment)
        # The batch queue extension is needed whenever this episode may run in
        # batch mode: explicitly (condition=batch) or via a routing policy that
        # can select batch as the effective condition.
        if self.condition == "native" and self.policy_strategy == "static":
            return

        files = self._extension_files()
        digest = self._source_digest(files)
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "batched-queue.tgz"
            with tarfile.open(archive, "w:gz") as tar:
                for path in files:
                    tar.add(path, arcname=path.relative_to(self.extension_root))
            await environment.upload_file(archive, "/tmp/batched-queue.tgz")

        await self.exec_as_agent(
            environment,
            command=(
                "set -euo pipefail; "
                f"rm -rf {EXTENSION_DIR} && mkdir -p {EXTENSION_DIR} && "
                f"tar -xzf /tmp/batched-queue.tgz -C {EXTENSION_DIR} && "
                ". ~/.nvm/nvm.sh && "
                f"npm install -g bun@{BUN_VERSION} && "
                f"cd {EXTENSION_DIR} && bun install --frozen-lockfile && "
                f"printf '%s\\n' {digest} > /logs/agent/extension.sha256"
            ),
        )

    def build_cli_flags(self) -> str:
        inherited = super().build_cli_flags()
        return " ".join(part for part in [inherited, condition_flags(self.condition)] if part)

    def _provider_env(self, provider: str) -> dict[str, str]:
        provider_keys = {
            "amazon-bedrock": ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
            "anthropic": ["ANTHROPIC_API_KEY", "ANTHROPIC_OAUTH_TOKEN"],
            "azure-openai-responses": [
                "AZURE_OPENAI_API_KEY",
                "AZURE_OPENAI_RESOURCE_NAME",
                "AZURE_OPENAI_BASE_URL",
                "AZURE_OPENAI_API_VERSION",
            ],
            "google": [
                "GEMINI_API_KEY",
                "GOOGLE_APPLICATION_CREDENTIALS",
                "GOOGLE_CLOUD_PROJECT",
                "GOOGLE_CLOUD_LOCATION",
                "GOOGLE_GENAI_USE_VERTEXAI",
            ],
            "openai": ["OPENAI_API_KEY"],
            "openrouter": ["OPENROUTER_API_KEY"],
        }
        batch_queue_keys = [
            "BATCH_QUEUE_EXECUTOR",
            "BATCH_QUEUE_EXECUTOR_PROVIDER",
            "BATCH_QUEUE_EXECUTOR_MODEL",
            "BATCH_QUEUE_EXECUTOR_THINKING",
            "BATCH_QUEUE_GROUNDING_TURNS",
        ]
        executor = self._get_env("BATCH_QUEUE_EXECUTOR") or ""
        providers = {provider}
        if "/" in executor:
            providers.add(executor.split("/", 1)[0])
        env: dict[str, str] = {}
        for key in [*batch_queue_keys, *(key for name in providers for key in provider_keys.get(name, []))]:
            value = self._get_env(key)
            if value:
                env[key] = value
        return env

    @override
    @with_prompt_template
    async def run(
        self,
        instruction: str,
        environment: BaseEnvironment,
        context: AgentContext,
    ) -> None:
        verifier_files = await self.exec_as_agent(
            environment,
            command="find /logs/verifier -mindepth 1 -print -quit 2>/dev/null || true",
        )
        if (verifier_files.stdout or "").strip():
            raise RuntimeError("verifier files are visible before agent execution")
        if not self.model_name or "/" not in self.model_name:
            raise ValueError("model must be provider/model")

        task_id = getattr(context, "task_id", None) or getattr(getattr(context, "task", None), "id", "unknown")
        
        effective_condition = self.condition
        if self.policy_strategy != "static":
            policy_kwargs = {}
            if self.policy_artifact:
                policy_kwargs["classifier_artifact"] = Path(self.policy_artifact)
            policy = ModePolicy(self.policy_strategy, **policy_kwargs)
            decision = policy.decide(task_id, instruction)
            effective_condition = decision["mode"]
            decision_json = json.dumps(decision)
            await self.exec_as_agent(
                environment,
                command=f"mkdir -p /logs/agent && printf '%s\\n' {shlex.quote(decision_json)} > /logs/agent/mode_decision.json",
            )

        provider, model = self.model_name.split("/", 1)
        formatted_instruction = instruction if not instruction.startswith("-") else f"\n{instruction}"
        cli_flags = " ".join(part for part in [super().build_cli_flags(), condition_flags(effective_condition)] if part)
        command = (
            ". ~/.nvm/nvm.sh; "
            "pi --print --mode json "
            f"--provider {shlex.quote(provider)} --model {shlex.quote(model)} "
            f"{cli_flags} {shlex.quote(formatted_instruction)} "
            "2>&1 </dev/null | grep -v '\"type\":\"message_update\"' | "
            f"stdbuf -oL tee /logs/agent/{self._OUTPUT_FILENAME}"
        )
        await self.exec_as_agent(environment, command=command, env=self._provider_env(provider))


def _self_check() -> None:
    native = condition_flags("native")
    batch = condition_flags("batch")
    assert native in batch
    assert "extension.ts" not in native
    assert batch.removeprefix(native).strip() == f"-e {EXTENSION_DIR}/src/extension.ts"
    try:
        condition_flags("invalid")
    except ValueError:
        pass
    else:
        raise AssertionError("invalid condition accepted")
    print(json.dumps({"native": native, "batch": batch}, indent=2))


if __name__ == "__main__":
    _self_check()
