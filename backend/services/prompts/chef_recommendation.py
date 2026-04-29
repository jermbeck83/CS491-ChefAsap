"""
Prompt builder for capability 4: chef recommendation shortlist.

Two-stage:
  1. SQL retrieval (done in menu_planner_service) -> top 20 chefs
  2. LLM picks 3-5 with rationales (this prompt)
  3. Post-process: feed those chef_ids through rank_chefs() to attach ml_score

build_messages(context) -> list[dict]
"""

import json
from services.prompts.system_prompt import get_system_block


def build_messages(context: dict) -> list[dict]:
    """
    Build messages to select the best chef shortlist from available_chefs.

    context keys:
        prior_messages   list[dict]
        prior_plan       dict
        available_chefs  list[dict]  (top 20 from SQL retrieval)
        cuisine          str
        guest_count      int
        event_date       str
        dietary          list[str]
    """
    prior_plan = context.get("prior_plan", {})
    cuisine = context.get("cuisine", "any")
    guest_count = context.get("guest_count", 1)
    dietary = context.get("dietary", [])
    event_date = context.get("event_date", "TBD")
    available_chefs = context.get("available_chefs", [])

    dietary_str = ", ".join(dietary) if dietary else "none"

    user_content = (
        f"From the <available_chefs> list below, select the 3 to 5 best chefs for "
        f"a {cuisine} event on {event_date} for {guest_count} guests "
        f"(dietary: {dietary_str}). "
        "Write one sentence explaining why each chef was chosen. "
        "Return ONLY valid JSON matching the schema — update only the "
        '"recommended_chefs" array; carry over all other fields unchanged.\n\n'
        f"<available_chefs>\n{json.dumps(available_chefs, indent=2)}\n</available_chefs>"
    )

    messages = list(context.get("prior_messages", []))
    if prior_plan:
        messages.append({"role": "assistant", "content": json.dumps(prior_plan)})
    messages.append({"role": "user", "content": user_content})
    return messages
