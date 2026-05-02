"""
Chef Productivity Assistant — Flask blueprint.

Prefix: /api/v1/chef-productivity  (registered in app.py)

Routes:
    POST  /booking/<booking_id>/prep-list   Capability 1 — prep list
    POST  /booking/<booking_id>/timeline    Capability 2 — cooking timeline
    POST  /substitutions                    Capability 3 — ingredient swaps
    POST  /booking/<booking_id>/plating     Capability 4 — plating notes
    GET   /booking/<booking_id>/sessions    Hydrate prior sessions
"""

from flask import Blueprint, request, jsonify
from functools import wraps
import jwt
import os
from dotenv import load_dotenv

import services.chef_productivity_service as productivity

load_dotenv()

chef_productivity_bp = Blueprint("chef_productivity", __name__)

SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "your-secret-key")


# ---------------------------------------------------------------------------
# JWT decorator (matches menu_event_planner_bp pattern)
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
# Routes
# ---------------------------------------------------------------------------

@chef_productivity_bp.route("/booking/<int:booking_id>/prep-list", methods=["POST"])
@token_required
def prep_list(current_user_id, user_type, booking_id):
    if user_type != "chef":
        return jsonify({"error": "Only chefs can use this feature"}), 403
    try:
        result = productivity.generate_prep_list(
            chef_user_id=current_user_id,
            booking_id=booking_id,
        )
        return jsonify({"success": True, **result}), 200
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        print(f"[chef_productivity] prep_list error: {e}")
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@chef_productivity_bp.route("/booking/<int:booking_id>/timeline", methods=["POST"])
@token_required
def timeline(current_user_id, user_type, booking_id):
    if user_type != "chef":
        return jsonify({"error": "Only chefs can use this feature"}), 403
    try:
        result = productivity.generate_timeline(
            chef_user_id=current_user_id,
            booking_id=booking_id,
        )
        return jsonify({"success": True, **result}), 200
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        print(f"[chef_productivity] timeline error: {e}")
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@chef_productivity_bp.route("/substitutions", methods=["POST"])
@token_required
def substitutions(current_user_id, user_type, ):
    if user_type != "chef":
        return jsonify({"error": "Only chefs can use this feature"}), 403

    data = request.get_json(silent=True) or {}
    original = data.get("ingredient", "").strip()
    reason = data.get("reason", "").strip()

    if not original:
        return jsonify({"error": "ingredient is required"}), 400
    if not reason:
        return jsonify({"error": "reason is required"}), 400

    try:
        result = productivity.generate_substitutions(
            chef_user_id=current_user_id,
            ingredient=original,
            reason=reason,
            dietary_restrictions=data.get("dietary_restrictions", []),
        )
        return jsonify({"success": True, **result}), 200
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        print(f"[chef_productivity] substitutions error: {e}")
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@chef_productivity_bp.route("/booking/<int:booking_id>/plating", methods=["POST"])
@token_required
def plating(current_user_id, user_type, booking_id):
    if user_type != "chef":
        return jsonify({"error": "Only chefs can use this feature"}), 403

    data = request.get_json(silent=True) or {}
    try:
        result = productivity.generate_plating(
            chef_user_id=current_user_id,
            booking_id=booking_id,
            dish_id=data.get("dish_id"),
        )
        return jsonify({"success": True, **result}), 200
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        print(f"[chef_productivity] plating error: {e}")
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@chef_productivity_bp.route("/booking/<int:booking_id>/sessions", methods=["GET"])
@token_required
def sessions(current_user_id, user_type, booking_id):
    if user_type != "chef":
        return jsonify({"error": "Only chefs can use this feature"}), 403
    try:
        result = productivity.get_sessions(
            chef_user_id=current_user_id,
            booking_id=booking_id,
        )
        return jsonify({"success": True, "sessions": result}), 200
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    except Exception as e:
        print(f"[chef_productivity] sessions error: {e}")
        return jsonify({"error": str(e)}), 500