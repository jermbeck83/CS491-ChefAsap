"""
Menu & Event Planner LLM — Flask blueprint.

All routes require JWT authentication (reuses @token_required from stripe_payment_bp).

Prefix: /api/v1/menu-planner   (registered in app.py)

Routes:
    POST  /plan                  one-shot full event plan
    POST  /chat                  multi-turn follow-up
    GET   /plan/<plan_id>        fetch a saved plan
    POST  /plan/<plan_id>/book   convert plan -> booking (stub)
"""

from flask import Blueprint, request, jsonify
from functools import wraps
import jwt
import os
from dotenv import load_dotenv

import services.menu_planner_service as planner

load_dotenv()

menu_event_planner_bp = Blueprint("menu_event_planner", __name__)

SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "your-secret-key")


# ---------------------------------------------------------------------------
# JWT decorator (matches stripe_payment_bp pattern)
# ---------------------------------------------------------------------------

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if "Authorization" in request.headers:
            try:
                token = request.headers["Authorization"].split(" ")[1]
            except IndexError:
                return jsonify({"error": "Invalid token format"}), 401

        if not token:
            return jsonify({"error": "Token is missing"}), 401

        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            current_user_id = data["user_id"]
            user_type = data.get("user_type")
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token has expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401

        return f(current_user_id, user_type, *args, **kwargs)

    return decorated


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def _validate_plan_request(data: dict) -> str | None:
    """Return an error message string or None if valid."""
    if not data.get("latitude") or not data.get("longitude"):
        return "latitude and longitude are required"
    try:
        gc = int(data.get("guest_count", 0))
        if gc < 1 or gc > 200:
            return "guest_count must be between 1 and 200"
    except (TypeError, ValueError):
        return "guest_count must be an integer"

    event_date = data.get("event_date")
    if not event_date:
        return "event_date is required"

    dietary = data.get("dietary_restrictions", [])
    if not isinstance(dietary, list):
        return "dietary_restrictions must be an array"

    return None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@menu_event_planner_bp.route("/plan", methods=["POST"])
@token_required
def create_plan(current_user_id, user_type):
    """One-shot: full event plan from a single user prompt + event details."""
    data = request.get_json(silent=True) or {}

    err = _validate_plan_request(data)
    if err:
        return jsonify({"error": err}), 400

    try:
        result = planner.create_event_plan(
            customer_id=current_user_id,
            latitude=float(data["latitude"]),
            longitude=float(data["longitude"]),
            zip_code=str(data.get("zip", "")),
            cuisine=str(data.get("cuisine", "")),
            guest_count=int(data.get("guest_count", 1)),
            event_date=str(data.get("event_date", "")),
            dietary=list(data.get("dietary_restrictions", [])),
        )
        return jsonify({"success": True, **result}), 200
    except RuntimeError as e:
        # Covers missing ANTHROPIC_API_KEY
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        print(f"[menu_event_planner] create_plan error: {e}")
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@menu_event_planner_bp.route("/chat", methods=["POST"])
@token_required
def chat(current_user_id, user_type):
    """
    Conversational entry point.
    - First turn: client sends conversation_id=null → backend bootstraps a new one.
    - Follow-ups: client echoes back the conversation_id from the previous response.
    Response shape matches the frontend chat UI: { conversation_id, role, content, plan }.
    """
    data = request.get_json(silent=True) or {}

    conversation_id = data.get("conversation_id")  # may be None → bootstrap
    message = (data.get("message") or "").strip()

    if not message:
        return jsonify({"error": "message is required"}), 400

    # Optional client-supplied location; service falls back to customer's default address.
    def _to_float(v):
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    try:
        result = planner.chat_turn(
            customer_id=current_user_id,
            conversation_id=conversation_id,
            user_message=message,
            latitude=_to_float(data.get("latitude")),
            longitude=_to_float(data.get("longitude")),
        )
        return jsonify(result), 200
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        print(f"[menu_event_planner] chat error: {e}")
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@menu_event_planner_bp.route("/plan/<int:plan_id>", methods=["GET"])
@token_required
def fetch_plan(current_user_id, user_type, plan_id):
    """Fetch a saved plan."""
    plan = planner.get_plan(plan_id)
    if not plan:
        return jsonify({"error": "Plan not found"}), 404
    # Only the owning customer may view the plan
    if plan.get("customer_id") != current_user_id:
        return jsonify({"error": "Unauthorized"}), 403
    return jsonify({"success": True, **plan}), 200


@menu_event_planner_bp.route("/plan/<int:plan_id>/book", methods=["POST"])
@token_required
def book_from_plan(current_user_id, user_type, plan_id):
    """
    Convert a plan into a booking using the first recommended chef.
    Stub — wires into the existing booking flow in booking_bp.
    """
    plan = planner.get_plan(plan_id)
    if not plan:
        return jsonify({"error": "Plan not found"}), 404
    if plan.get("customer_id") != current_user_id:
        return jsonify({"error": "Unauthorized"}), 403

    recs = (plan.get("plan") or {}).get("recommended_chefs", [])
    if not recs:
        return jsonify({"error": "No chef recommendations found in this plan"}), 400

    top_chef_id = recs[0].get("chef_id")
    return jsonify({
        "success": True,
        "message": "Redirect to booking flow",
        "chef_id": top_chef_id,
        "plan_id": plan_id,
        "conversation_id": plan.get("conversation_id"),
    }), 200
