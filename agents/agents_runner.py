import asyncio
import json
import os
import sys

from dotenv import load_dotenv

try:
    from agents import Agent, Runner, set_default_openai_api
    from agents.mcp import MCPServerStdio
except Exception as exc:  # pragma: no cover
    sys.stderr.write(f"missing dependencies: {exc}\n")
    sys.exit(2)


def read_input():
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"prompt": raw.strip()}


def build_instructions(thread_id, tool_config):
    config_json = json.dumps(tool_config)
    return "\n".join(
        [
            "You are a dispatcher. Always call the Codex MCP tool.",
            "If thread_id is provided, call `codex-reply` with that threadId.",
            "Otherwise call `codex` to start a new thread.",
            f"Always pass this config object in the tool call: {config_json}",
            "After the tool call, respond with strict JSON only:",
            '{\"text\":\"...\",\"threadId\":\"...\"}',
            "threadId must be the tool response threadId if available, else empty string.",
            f"thread_id={thread_id or ''}",
        ]
    )


def build_planner_instructions() -> str:
    return "\n".join(
        [
            "You are a planner sub-agent.",
            "Summarize the task, identify key files/commands needed, and outline a short plan.",
            "Do not call tools. Output plain text with bullet points.",
        ]
    )


def build_risk_instructions() -> str:
    return "\n".join(
        [
            "You are a risk reviewer sub-agent.",
            "Identify security or privacy risks and suggest safer alternatives.",
            "Do not call tools. Output plain text with bullets.",
        ]
    )


def build_approval_instructions() -> str:
    return "\n".join(
        [
            "You are a security reviewer.",
            "Decide whether a non-owner request should require owner approval.",
            "Approval is required if the message requests any of:",
            "- reading/writing files, running commands, system config changes",
            "- accessing secrets/tokens/keys, logs, browsing history, env vars",
            "- changes to permissions/owners/allowlists/admins",
            "- any action that can affect host security or privacy",
            "If unsure, set needs_approval=true.",
            "Return strict JSON ONLY:",
            '{"needs_approval":true/false,"reason":"short reason","highlight":"short excerpt"}',
        ]
    )


async def run(payload):
    prompt = payload.get("prompt") or ""
    if not prompt:
        return {"text": "empty prompt", "threadId": ""}

    cwd = payload.get("cwd")
    approval_policy = payload.get("approval_policy", "never")
    sandbox = payload.get("sandbox", "workspace-write")
    base_instructions = payload.get("base_instructions")
    thread_id = payload.get("thread_id")

    codex_cmd = ["codex", "mcp-server"]

    server_params = {
        "command": codex_cmd[0],
        "args": codex_cmd[1:],
        "env": os.environ.copy(),
    }
    async with MCPServerStdio(
        server_params,
        use_structured_content=True,
    ) as codex_server:
        tool_config = {
            "approval-policy": approval_policy,
            "sandbox": sandbox,
        }
        if cwd:
            tool_config["cwd"] = cwd
        if base_instructions:
            tool_config["base-instructions"] = base_instructions

        planner = Agent(
            name="Planner",
            instructions=build_planner_instructions(),
        )
        risk = Agent(
            name="RiskReviewer",
            instructions=build_risk_instructions(),
        )

        plan_result, risk_result = await asyncio.gather(
            Runner.run(planner, prompt, max_turns=2),
            Runner.run(risk, prompt, max_turns=2),
        )
        plan_text = plan_result.final_output or ""
        risk_text = risk_result.final_output or ""

        coordinator = Agent(
            name="Coordinator",
            instructions=build_instructions(thread_id, tool_config),
            mcp_servers=[codex_server],
        )

        enriched_prompt = (
            f"{prompt}\n\n"
            f"[planner]\n{plan_text}\n\n"
            f"[risk-review]\n{risk_text}\n"
        )

        result = await Runner.run(coordinator, enriched_prompt, max_turns=8)
        output = result.final_output or ""

        try:
            parsed = json.loads(output)
            if isinstance(parsed, dict) and "text" in parsed:
                return {
                    "text": parsed.get("text", ""),
                    "threadId": parsed.get("threadId", ""),
                }
        except json.JSONDecodeError:
            pass

        return {"text": output.strip(), "threadId": ""}


async def run_approval_check(payload):
    prompt = payload.get("prompt") or ""
    if not prompt:
        return {"needsApproval": False, "reason": "", "highlight": ""}

    reviewer = Agent(
        name="ApprovalJudge",
        instructions=build_approval_instructions(),
    )
    result = await Runner.run(reviewer, prompt, max_turns=2)
    output = result.final_output or ""
    try:
        parsed = json.loads(output)
    except json.JSONDecodeError:
        return {
            "needsApproval": True,
            "reason": "model_output_invalid",
            "highlight": "",
        }

    needs = parsed.get("needs_approval")
    if needs is None:
        needs = parsed.get("needsApproval")
    if needs is None:
        return {
            "needsApproval": True,
            "reason": "model_output_missing",
            "highlight": "",
        }
    reason = parsed.get("reason") or ""
    highlight = parsed.get("highlight") or ""

    return {
        "needsApproval": bool(needs),
        "reason": str(reason),
        "highlight": str(highlight),
    }


def main():
    load_dotenv()
    set_default_openai_api("responses")
    payload = read_input()
    if payload.get("mode") == "approval_check":
        response = asyncio.run(run_approval_check(payload))
    else:
        response = asyncio.run(run(payload))
    sys.stdout.write(json.dumps(response, ensure_ascii=False))


if __name__ == "__main__":
    main()
