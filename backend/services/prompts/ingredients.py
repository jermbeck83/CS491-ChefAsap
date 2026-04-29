"""
Prompt builder for capability 2: ingredient / shopping list.

Runs as a follow-up turn on the same conversation so the system prompt
and prior menu output are already cached.

build_messages(context) -> list[dict]
"""

import json
from services.prompts.system_prompt import get_system_block


def build_messages(context: dict) -> list[dict]:
    """
    Build messages for a shopping list follow-up.

    context keys:
        prior_messages  list[dict]  (the messages that produced the menu)
        prior_plan      dict        (the plan JSON already returned)
        guest_count     int
    """
    prior_plan = context.get("prior_plan", {})
    guest_count = context.get("guest_count", 1)

    user_content = (
        f"Based on the menu above for {guest_count} guests, produce a complete "
        "ingredient shopping list. Aggregate quantities across all courses. "
        "Return ONLY valid JSON matching the schema — update only the "
        '"ingredients" array; carry over all other fields unchanged from the '
        "prior plan."
    )

    messages = list(context.get("prior_messages", []))
    if prior_plan:
        messages.append({"role": "assistant", "content": json.dumps(prior_plan)})
    messages.append({"role": "user", "content": user_content})
    return messages
