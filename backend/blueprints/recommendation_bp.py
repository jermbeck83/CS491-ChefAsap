"""
Recommendation Engine — Flask blueprint.

All routes require JWT authentication.
Prefix: /api/v1/recommendations   (registered in app.py)

Routes:
    GET /for-you?limit=10
    GET /similar-chefs/<int:chef_id>?limit=10
    GET /popular-menus?lat=<f>&lng=<f>&radius=10&limit=10
"""

from flask import Blueprint, request, jsonify
from functools import wraps
import jwt
import os
from dotenv import load_dotenv

import services.recommendation_service as rec_svc

load_dotenv()

recommendation_bp = Blueprint("recommendation", __name__)

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
# Validation helpers
# ---------------------------------------------------------------------------

def _parse_limit(raw) -> tuple[int | None, str | None]:
    try:
        v = int(raw) if raw is not None else 10
        if v < 1 or v > 50:
            return None, "limit must be between 1 and 50"
        return v, None
    except (TypeError, ValueError):
        return None, "limit must be an integer"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@recommendation_bp.route("/for-you", methods=["GET"])
@token_required
def for_you(current_user_id, user_type):
    limit, err = _parse_limit(request.args.get("limit"))
    if err:
        return jsonify({"error": err}), 400

    try:
        result = rec_svc.get_recommendations_for_customer(current_user_id, limit=limit)
        return jsonify({"success": True, **result}), 200
    except Exception as e:
        print(f"[recommendation_bp] for-you error: {e}")
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@recommendation_bp.route("/similar-chefs/<int:chef_id>", methods=["GET"])
@token_required
def similar_chefs_route(current_user_id, user_type, chef_id):
    limit, err = _parse_limit(request.args.get("limit"))
    if err:
        return jsonify({"error": err}), 400

    try:
        result = rec_svc.get_similar_chefs(chef_id, customer_id=current_user_id, limit=limit)
        return jsonify({"success": True, **result}), 200
    except Exception as e:
        print(f"[recommendation_bp] similar-chefs error: {e}")
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@recommendation_bp.route("/popular-menus", methods=["GET"])
@token_required
def popular_menus(current_user_id, user_type):
    try:
        lat = float(request.args["lat"])
        lng = float(request.args["lng"])
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "lat and lng must be valid floats"}), 400

    try:
        radius = float(request.args.get("radius", 10))
        if radius < 1 or radius > 50:
            return jsonify({"error": "radius must be between 1 and 50"}), 400
    except (TypeError, ValueError):
        return jsonify({"error": "radius must be a number"}), 400

    limit, err = _parse_limit(request.args.get("limit"))
    if err:
        return jsonify({"error": err}), 400

    try:
        result = rec_svc.get_popular_menus_near(lat, lng, radius=radius, limit=limit)
        return jsonify({"success": True, **result}), 200
    except Exception as e:
        print(f"[recommendation_bp] popular-menus error: {e}")
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500
