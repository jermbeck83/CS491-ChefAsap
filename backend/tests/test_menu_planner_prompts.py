"""
Tests for the Menu & Event Planner prompt builders.

Covers:
  - Deterministic message structure for each prompt module
  - System prompt caching block presence
  - Output schema validation against golden event scenarios (mocked LLM)
  - Integration: end-to-end JSON shape via mocked Anthropic client
"""

import json
import unittest
from unittest.mock import MagicMock, patch

# Prompt builders
from services.prompts.system_prompt import get_system_block, SYSTEM_PROMPT_TEXT
from services.prompts import menu_generation, ingredients, cost_estimation, chef_recommendation
from services.llm_service import call_llm

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SAMPLE_CHEFS = [
    {
        "chef_id": 12,
        "full_name": "Marcus Green",
        "cuisines": "Caribbean, Jamaican",
        "average_rating": 4.8,
        "total_reviews": 120,
        "base_rate_per_person": 32.0,
        "minimum_people": 4,
        "maximum_people": 50,
        "city": "Newark",
        "state": "NJ",
        "distance_miles": 3.2,
    }
]

SAMPLE_PRICING = [
    {
        "chef_id": 12,
        "base_rate_per_person": 32.0,
        "dynamic_rate_per_person": 36.8,
        "multiplier": 1.15,
    }
]

GOLDEN_PLAN = {
    "event_summary": {"cuisine": "Jamaican", "guest_count": 12, "dietary_notes": []},
    "menu": [
        {"course": "appetizer", "dish": "Jerk Chicken Wings", "rationale": "Classic Caribbean starter.", "serves": 12},
        {"course": "main", "dish": "Oxtail Stew", "rationale": "Rich slow-cooked centerpiece.", "serves": 12},
        {"course": "side", "dish": "Rice and Peas", "rationale": "Traditional pairing.", "serves": 12},
        {"course": "dessert", "dish": "Rum Cake", "rationale": "Iconic Caribbean dessert.", "serves": 12},
    ],
    "ingredients": [
        {"item": "Chicken wings", "quantity": "6", "unit": "lbs", "course": "appetizer"},
    ],
    "cost_estimate": {
        "per_person_usd": 52.0,
        "total_usd": 624.0,
        "breakdown": {"ingredients": 240.0, "chef_service": 384.0},
        "confidence": "medium",
    },
    "recommended_chefs": [
        {"chef_id": 12, "match_reason": "Specializes in Caribbean cuisine.", "ml_score": 0.87}
    ],
}

FIVE_SCENARIOS = [
    {"cuisine": "Jamaican", "guest_count": 12, "dietary": [], "event_date": "2026-06-15", "zip_code": "07102"},
    {"cuisine": "Italian", "guest_count": 8, "dietary": ["vegetarian"], "event_date": "2026-07-20", "zip_code": "07102"},
    {"cuisine": "Mexican", "guest_count": 20, "dietary": ["gluten-free"], "event_date": "2026-08-05", "zip_code": "07102"},
    {"cuisine": "Japanese", "guest_count": 6, "dietary": ["nut-free"], "event_date": "2026-09-10", "zip_code": "07102"},
    {"cuisine": "Indian", "guest_count": 30, "dietary": ["vegan", "gluten-free"], "event_date": "2026-10-01", "zip_code": "07102"},
]

REQUIRED_TOP_KEYS = {"event_summary", "menu", "ingredients", "cost_estimate", "recommended_chefs"}
REQUIRED_EVENT_SUMMARY_KEYS = {"cuisine", "guest_count", "dietary_notes"}
REQUIRED_COST_KEYS = {"per_person_usd", "total_usd", "breakdown", "confidence"}


# ---------------------------------------------------------------------------
# System prompt tests
# ---------------------------------------------------------------------------

class TestSystemPrompt(unittest.TestCase):
    def test_cache_control_present(self):
        block = get_system_block()
        self.assertEqual(block["type"], "text")
        self.assertIn("cache_control", block)
        self.assertEqual(block["cache_control"]["type"], "ephemeral")

    def test_system_prompt_contains_key_rules(self):
        self.assertIn("Only recommend chefs whose chef_id appears in", SYSTEM_PROMPT_TEXT)
        self.assertIn("dietary", SYSTEM_PROMPT_TEXT)
        self.assertIn("pricing_context", SYSTEM_PROMPT_TEXT)


# ---------------------------------------------------------------------------
# Menu generation prompt tests
# ---------------------------------------------------------------------------

class TestMenuGenerationPrompt(unittest.TestCase):
    def _build_context(self, scenario):
        return {
            **scenario,
            "available_chefs": SAMPLE_CHEFS,
            "pricing_context": SAMPLE_PRICING,
        }

    def test_returns_list_with_one_user_message(self):
        ctx = self._build_context(FIVE_SCENARIOS[0])
        msgs = menu_generation.build_messages(ctx)
        self.assertIsInstance(msgs, list)
        self.assertEqual(len(msgs), 1)
        self.assertEqual(msgs[0]["role"], "user")

    def test_user_message_contains_event_request_block(self):
        ctx = self._build_context(FIVE_SCENARIOS[0])
        msgs = menu_generation.build_messages(ctx)
        self.assertIn("<event_request>", msgs[0]["content"])

    def test_user_message_contains_available_chefs_block(self):
        ctx = self._build_context(FIVE_SCENARIOS[0])
        msgs = menu_generation.build_messages(ctx)
        self.assertIn("<available_chefs>", msgs[0]["content"])

    def test_user_message_contains_pricing_context_block(self):
        ctx = self._build_context(FIVE_SCENARIOS[0])
        msgs = menu_generation.build_messages(ctx)
        self.assertIn("<pricing_context>", msgs[0]["content"])

    def test_dietary_restrictions_included(self):
        ctx = self._build_context(FIVE_SCENARIOS[1])  # vegetarian
        msgs = menu_generation.build_messages(ctx)
        self.assertIn("vegetarian", msgs[0]["content"])

    def test_guest_count_included(self):
        ctx = self._build_context(FIVE_SCENARIOS[2])  # 20 guests
        msgs = menu_generation.build_messages(ctx)
        self.assertIn("20", msgs[0]["content"])

    def test_few_shot_examples_present(self):
        ctx = self._build_context(FIVE_SCENARIOS[0])
        msgs = menu_generation.build_messages(ctx)
        self.assertIn("Example 1", msgs[0]["content"])
        self.assertIn("Example 2", msgs[0]["content"])


# ---------------------------------------------------------------------------
# Ingredients prompt tests
# ---------------------------------------------------------------------------

class TestIngredientsPrompt(unittest.TestCase):
    def test_appends_follow_up_user_turn(self):
        prior_messages = menu_generation.build_messages({
            "cuisine": "Jamaican", "guest_count": 12, "dietary": [],
            "event_date": "2026-06-15", "zip_code": "07102",
            "available_chefs": SAMPLE_CHEFS, "pricing_context": SAMPLE_PRICING,
        })
        ctx = {
            "prior_messages": prior_messages,
            "prior_plan": GOLDEN_PLAN,
            "guest_count": 12,
        }
        msgs = ingredients.build_messages(ctx)
        self.assertEqual(msgs[-1]["role"], "user")
        self.assertIn("shopping list", msgs[-1]["content"])

    def test_prior_plan_injected_as_assistant_turn(self):
        ctx = {
            "prior_messages": [],
            "prior_plan": GOLDEN_PLAN,
            "guest_count": 12,
        }
        msgs = ingredients.build_messages(ctx)
        assistant_turns = [m for m in msgs if m["role"] == "assistant"]
        self.assertEqual(len(assistant_turns), 1)
        plan_in_turn = json.loads(assistant_turns[0]["content"])
        self.assertIn("event_summary", plan_in_turn)


# ---------------------------------------------------------------------------
# Cost estimation prompt tests
# ---------------------------------------------------------------------------

class TestCostEstimationPrompt(unittest.TestCase):
    def test_pricing_context_in_user_turn(self):
        ctx = {
            "prior_messages": [],
            "prior_plan": GOLDEN_PLAN,
            "pricing_context": SAMPLE_PRICING,
            "guest_count": 12,
        }
        msgs = cost_estimation.build_messages(ctx)
        self.assertIn("<pricing_context>", msgs[-1]["content"])

    def test_guest_count_mentioned(self):
        ctx = {
            "prior_messages": [],
            "prior_plan": GOLDEN_PLAN,
            "pricing_context": SAMPLE_PRICING,
            "guest_count": 20,
        }
        msgs = cost_estimation.build_messages(ctx)
        self.assertIn("20", msgs[-1]["content"])


# ---------------------------------------------------------------------------
# Chef recommendation prompt tests
# ---------------------------------------------------------------------------

class TestChefRecommendationPrompt(unittest.TestCase):
    def test_available_chefs_in_user_turn(self):
        ctx = {
            "prior_messages": [],
            "prior_plan": GOLDEN_PLAN,
            "available_chefs": SAMPLE_CHEFS,
            "cuisine": "Jamaican",
            "guest_count": 12,
            "event_date": "2026-06-15",
            "dietary": [],
        }
        msgs = chef_recommendation.build_messages(ctx)
        self.assertIn("<available_chefs>", msgs[-1]["content"])

    def test_dietary_mentioned_in_request(self):
        ctx = {
            "prior_messages": [],
            "prior_plan": GOLDEN_PLAN,
            "available_chefs": SAMPLE_CHEFS,
            "cuisine": "Italian",
            "guest_count": 8,
            "event_date": "2026-07-20",
            "dietary": ["vegetarian"],
        }
        msgs = chef_recommendation.build_messages(ctx)
        self.assertIn("vegetarian", msgs[-1]["content"])


# ---------------------------------------------------------------------------
# Output schema validation (mocked LLM)
# ---------------------------------------------------------------------------

class TestOutputSchemaValidation(unittest.TestCase):
    """Snapshot tests: assert schema completeness for all 5 golden scenarios."""

    def _mock_response(self, plan_dict):
        mock_block = MagicMock()
        mock_block.type = "text"
        mock_block.text = json.dumps(plan_dict)

        mock_usage = MagicMock()
        mock_usage.input_tokens = 100
        mock_usage.output_tokens = 50
        mock_usage.cache_creation_input_tokens = 0
        mock_usage.cache_read_input_tokens = 80

        mock_resp = MagicMock()
        mock_resp.content = [mock_block]
        mock_resp.usage = mock_usage
        mock_resp.model = "claude-sonnet-4-6"
        return mock_resp

    @patch("services.llm_service._get_client")
    def test_five_golden_scenarios_schema(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.messages.create.return_value = self._mock_response(GOLDEN_PLAN)
        mock_get_client.return_value = mock_client

        for scenario in FIVE_SCENARIOS:
            with self.subTest(cuisine=scenario["cuisine"]):
                context = {
                    **scenario,
                    "available_chefs": SAMPLE_CHEFS,
                    "pricing_context": SAMPLE_PRICING,
                }
                messages = menu_generation.build_messages(context)
                plan, usage = call_llm(messages)

                # Top-level schema keys
                self.assertTrue(
                    REQUIRED_TOP_KEYS.issubset(plan.keys()),
                    f"Missing keys: {REQUIRED_TOP_KEYS - plan.keys()}"
                )

                # event_summary sub-keys
                self.assertTrue(
                    REQUIRED_EVENT_SUMMARY_KEYS.issubset(plan["event_summary"].keys())
                )

                # cost_estimate sub-keys
                self.assertTrue(
                    REQUIRED_COST_KEYS.issubset(plan["cost_estimate"].keys())
                )

                # menu is non-empty list
                self.assertIsInstance(plan["menu"], list)
                self.assertGreater(len(plan["menu"]), 0)

                # recommended_chefs has chef_id
                for rec in plan["recommended_chefs"]:
                    self.assertIn("chef_id", rec)
                    self.assertIn("match_reason", rec)

                # usage contains cache field
                self.assertIn("cache_read_input_tokens", usage)

    @patch("services.llm_service._get_client")
    def test_parse_error_handled_gracefully(self, mock_get_client):
        """If LLM returns non-JSON, call_llm should not raise."""
        mock_block = MagicMock()
        mock_block.type = "text"
        mock_block.text = "I cannot help with that request."
        mock_usage = MagicMock()
        mock_usage.input_tokens = 10
        mock_usage.output_tokens = 8
        mock_usage.cache_creation_input_tokens = 0
        mock_usage.cache_read_input_tokens = 0
        mock_resp = MagicMock()
        mock_resp.content = [mock_block]
        mock_resp.usage = mock_usage
        mock_resp.model = "claude-sonnet-4-6"
        mock_get_client.return_value = MagicMock(messages=MagicMock(
            create=MagicMock(return_value=mock_resp)
        ))

        plan, _ = call_llm([{"role": "user", "content": "test"}])
        self.assertIn("_parse_error", plan)

    @patch("services.llm_service._get_client")
    def test_markdown_fenced_json_stripped(self, mock_get_client):
        """call_llm should strip ```json ... ``` fences before parsing."""
        mock_block = MagicMock()
        mock_block.type = "text"
        mock_block.text = "```json\n" + json.dumps(GOLDEN_PLAN) + "\n```"
        mock_usage = MagicMock()
        mock_usage.input_tokens = 50
        mock_usage.output_tokens = 200
        mock_usage.cache_creation_input_tokens = 50
        mock_usage.cache_read_input_tokens = 0
        mock_resp = MagicMock()
        mock_resp.content = [mock_block]
        mock_resp.usage = mock_usage
        mock_resp.model = "claude-sonnet-4-6"
        mock_get_client.return_value = MagicMock(messages=MagicMock(
            create=MagicMock(return_value=mock_resp)
        ))

        plan, _ = call_llm([{"role": "user", "content": "test"}])
        self.assertNotIn("_parse_error", plan)
        self.assertIn("event_summary", plan)


if __name__ == "__main__":
    unittest.main()
