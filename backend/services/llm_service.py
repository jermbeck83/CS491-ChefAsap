"""
Anthropic Claude client with prompt caching, retry handling, and streaming.

Usage:
    from services.llm_service import call_llm, call_llm_stream

Models (per backend plan):
    DEFAULT_MODEL  - claude-sonnet-4-6  (full event planning)
    FAST_MODEL     - claude-haiku-4-5-20251001  (follow-up chat turns)
"""

import os
import json
import anthropic
from dotenv import load_dotenv

from services.prompts.system_prompt import get_system_block

load_dotenv()

DEFAULT_MODEL = "claude-sonnet-4-6"
FAST_MODEL = "claude-haiku-4-5-20251001"
MAX_TOKENS = 4096


def _get_client() -> anthropic.Anthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY environment variable not set")
    return anthropic.Anthropic(api_key=api_key)


def call_llm(
    messages: list[dict],
    model: str = DEFAULT_MODEL,
    max_tokens: int = MAX_TOKENS,
    use_cache: bool = True,
) -> tuple[dict, dict]:
    """
    Call Claude with the shared (cached) system prompt.

    Returns:
        (parsed_json, usage_dict)
        parsed_json  - the plan JSON parsed from Claude's response
        usage_dict   - token counts including cache_read_input_tokens
    """
    client = _get_client()

    system = [get_system_block()] if use_cache else [{"type": "text", "text": get_system_block()["text"]}]

    response = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=messages,
    )

    usage = {
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
        "cache_creation_input_tokens": getattr(response.usage, "cache_creation_input_tokens", 0),
        "cache_read_input_tokens": getattr(response.usage, "cache_read_input_tokens", 0),
        "model": response.model,
    }

    text = next(
        (block.text for block in response.content if block.type == "text"), "{}"
    )

    # Strip markdown code fences if the model wraps the JSON
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.rsplit("```", 1)[0].strip()

    try:
        plan = json.loads(text)
    except json.JSONDecodeError:
        plan = {"raw_response": text, "_parse_error": True}

    return plan, usage


def call_llm_stream(
    messages: list[dict],
    model: str = DEFAULT_MODEL,
    max_tokens: int = MAX_TOKENS,
    use_cache: bool = True,
):
    """
    Stream Claude's response. Yields text deltas as strings.
    Caller should accumulate them and parse JSON at the end.
    """
    client = _get_client()

    system = [get_system_block()] if use_cache else [{"type": "text", "text": get_system_block()["text"]}]

    with client.messages.stream(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=messages,
    ) as stream:
        for text in stream.text_stream:
            yield text
