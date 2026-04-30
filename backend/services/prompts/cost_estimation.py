"""
Prompt builder for capability 3: cost estimation.

The pricing_context block is populated from chef_pricing.base_rate_per_person
for the candidate chefs and the live multiplier from DynamicPricingEngine.

build_messages(context) -> list[dict]
"""

import json
from services.prompts.system_prompt import get_system_block


def build_messages(context: dict) -> list[dict]:
    """
    Build messages for a cost estimate request.

    context keys:
        prior_messages   list[dict]  (conversation so far)
        prior_plan       dict        (plan produced by menu_generation)
        pricing_context  list[dict]  (chef_pricing rows + multiplier)
        guest_count      int
    """
    prior_plan = context.get("prior_plan", {})
    guest_count = context.get("guest_count", 1)
    pricing_context = context.get("pricing_context", [])

    user_content = (
        f"Using the pricing data below, compute a cost estimate for {guest_count} guests. "
        "Combine ingredient costs (use the rough per-item prices from the menu) with "
        "the chef service rate from <pricing_context>. "
        "Set confidence to 'high' if all chef rates are available, 'medium' if some are "
        "missing, and 'low' if none are available. "
        "Return ONLY valid JSON matching the schema — update only the "
        '"cost_estimate" field; carry over all other fields unchanged.\n\n'
        f"<pricing_context>\n{json.dumps(pricing_context, indent=2)}\n</pricing_context>"
    )

    messages = list(context.get("prior_messages", []))
    if prior_plan:
        messages.append({"role": "assistant", "content": json.dumps(prior_plan)})
    messages.append({"role": "user", "content": user_content})
    return messages
