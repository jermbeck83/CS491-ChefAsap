"""
Quick smoke test against the real Anthropic API.
Run from the backend/ directory:

    python smoke_test_llm.py

Reads ANTHROPIC_API_KEY from .env automatically.
Prints the full plan JSON and cache usage stats.
"""

import json
from dotenv import load_dotenv
load_dotenv()  # picks up backend/.env

from services.prompts import menu_generation
from services.llm_service import call_llm
import services.menu_planner_service as planner

CONTEXT = {
    "cuisine": "Jamaican",
    "guest_count": 12,
    "event_date": "2026-06-15",
    "dietary": [],
    "zip_code": "07102",
    "available_chefs": [
        {
            "chef_id": 12,
            "full_name": "Marcus Green",
            "cuisines": "Caribbean, Jamaican",
            "average_rating": 4.8,
            "total_reviews": 120,
            "base_rate_per_person": 32.0,
            "city": "Newark",
            "state": "NJ",
            "distance_miles": 3.2,
        }
    ],
    "pricing_context": [
        {
            "chef_id": 12,
            "base_rate_per_person": 32.0,
            "dynamic_rate_per_person": 36.80,
            "multiplier": 1.15,
        }
    ],
}

if __name__ == "__main__":
    print("=== Call 1 (cache write) ===")
    messages = menu_generation.build_messages(CONTEXT)
    plan, usage = call_llm(messages)
    print(json.dumps(plan, indent=2))
    print("\nUsage:", usage)

    print("\n=== Call 2 (should show cache_read_input_tokens > 0) ===")
    plan2, usage2 = call_llm(messages)
    print("Usage:", usage2)
    hit = usage2.get("cache_read_input_tokens", 0)
    print(f"\nCache hit: {'YES ✓' if hit > 0 else 'NO — check for silent invalidators'}")

    print("\n=== Call 3 (full service — writes to event_plans + event_plan_messages) ===")
    print("Requires a valid customer_id in your DB. Edit CUSTOMER_ID below first.")
    CUSTOMER_ID = 6  # change to a real customer id from your customers table
    result = planner.create_event_plan(
        customer_id=CUSTOMER_ID,
        latitude=40.7357,
        longitude=-74.1724,
        zip_code="07102",
        cuisine="Jamaican",
        guest_count=12,
        event_date="2026-06-15",
        dietary=[],
    )
    print(f"plan_id:         {result['plan_id']}")
    print(f"conversation_id: {result['conversation_id']}")
    print(f"Usage:           {result['usage']}")
    print("\nCheck pgAdmin — you should now see rows in event_plans and event_plan_messages.")
