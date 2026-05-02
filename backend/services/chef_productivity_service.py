"""
Orchestrator for the Chef Productivity Assistant LLM feature.

Four capabilities:
  1. prep_list   — ingredient/station prep anchored to T-24h/T-2h/T-30m windows
  2. timeline    — back-timed cooking schedule from the service hour
  3. substitutions — ranked ingredient swaps (no booking required)
  4. plating     — presentation guidance per dish
"""

import json
from database.db_helper import get_db_connection, get_cursor
from services.llm_service import call_llm, DEFAULT_MODEL, FAST_MODEL


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def _get_chef_id_for_user(conn, user_id: int) -> int | None:
    """Look up chef_id from the users table using the JWT user_id."""
    cursor = get_cursor(conn, dictionary=True)
    try:
        cursor.execute("SELECT chef_id FROM users WHERE id = %s", (user_id,))
        row = cursor.fetchone()
        return row["chef_id"] if row and row["chef_id"] else None
    finally:
        cursor.close()


def _get_booking(conn, booking_id: int) -> dict | None:
    cursor = get_cursor(conn, dictionary=True)
    try:
        cursor.execute("""
            SELECT b.id, b.chef_id, b.customer_id, b.booking_date, b.booking_time,
                   b.cuisine_type, b.meal_type, b.number_of_people,
                   b.special_notes, b.status
            FROM bookings b
            WHERE b.id = %s
        """, (booking_id,))
        row = cursor.fetchone()
        if not row:
            return None
        return {
            "booking_id": row["id"],
            "chef_id": row["chef_id"],
            "customer_id": row["customer_id"],
            "booking_date": str(row["booking_date"]) if row["booking_date"] else None,
            "booking_time": str(row["booking_time"]) if row["booking_time"] else None,
            "cuisine_type": row["cuisine_type"],
            "meal_type": row["meal_type"],
            "number_of_people": row["number_of_people"],
            "special_notes": row["special_notes"],
            "status": row["status"],
        }
    finally:
        cursor.close()


def _get_chef_menu(conn, chef_id: int) -> list[dict]:
    cursor = get_cursor(conn, dictionary=True)
    try:
        cursor.execute("""
            SELECT id, dish_name, description, cuisine_type,
                   dietary_info, spice_level, price, prep_time, servings
            FROM chef_menu_items
            WHERE chef_id = %s AND is_available = TRUE
            ORDER BY display_order ASC
        """, (chef_id,))
        rows = cursor.fetchall()
        return [
            {
                "id": r["id"],
                "dish_name": r["dish_name"],
                "description": r["description"],
                "cuisine_type": r["cuisine_type"],
                "dietary_info": r["dietary_info"],
                "spice_level": r["spice_level"],
                "price": float(r["price"]) if r["price"] else None,
                "prep_time": r["prep_time"],
                "servings": r["servings"],
            }
            for r in rows
        ]
    finally:
        cursor.close()


def _persist_session(conn, chef_id, booking_id, capability, request_json,
                     response_json, model, usage):
    cursor = get_cursor(conn)
    try:
        cursor.execute("""
            INSERT INTO chef_productivity_sessions
                (chef_id, booking_id, capability, request_json, response_json,
                 llm_model, input_tokens, output_tokens, cache_read_tokens)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            chef_id,
            booking_id,
            capability,
            json.dumps(request_json),
            json.dumps(response_json),
            model,
            usage.get("input_tokens", 0),
            usage.get("output_tokens", 0),
            usage.get("cache_read_input_tokens", 0),
        ))
        conn.commit()
    finally:
        cursor.close()


def _get_latest_sessions(conn, chef_id, booking_id) -> dict:
    """Return latest response per capability as a dict keyed by capability."""
    cursor = get_cursor(conn, dictionary=True)
    try:
        cursor.execute("""
            SELECT DISTINCT ON (capability)
                capability, response_json, created_at
            FROM chef_productivity_sessions
            WHERE chef_id = %s AND booking_id = %s
            ORDER BY capability, created_at DESC
        """, (chef_id, booking_id))
        rows = cursor.fetchall()
        result = {}
        for row in rows:
            cap = row["capability"]
            result[cap] = row["response_json"]
        return result
    finally:
        cursor.close()


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are ChefASAP's kitchen-side assistant for working chefs.
You produce concise, action-ready prep lists, timelines, substitutions, and plating notes
for a specific upcoming booking.

Hard rules:
- Ground every dish in the chef's actual menu items provided in <chef_menu>. Never invent dishes.
- Always respect any dietary_restrictions in the booking; flag conflicts explicitly.
- For substitutions, never recommend ingredients that violate dietary restrictions.
- Output is ALWAYS valid JSON matching the requested schema — no prose before or after.
- Be terse and professional. Kitchen shorthand is acceptable (e.g. "mise: dice 1lb shallots").
- Politely decline non-culinary tasks."""


def _build_prep_list_messages(booking: dict, menu: list[dict]) -> list[dict]:
    user_content = f"""<booking_details>
{json.dumps(booking, indent=2)}
</booking_details>

<chef_menu>
{json.dumps(menu, indent=2)}
</chef_menu>

Task: Generate a detailed prep list for this booking. Group tasks by time window:
T-24h (day before), T-12h, T-2h, T-30m (day of, just before service).

Return ONLY this JSON schema:
{{
  "booking_id": {booking['booking_id']},
  "prep_list": [
    {{"dish": "dish name", "task": "specific prep task", "duration_min": 15, "do_at": "T-24h"}}
  ]
}}"""

    return [
        {"role": "user", "content": [
            {"type": "text", "text": SYSTEM_PROMPT,
             "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": user_content},
        ]}
    ]


def _build_timeline_messages(booking: dict, menu: list[dict]) -> list[dict]:
    service_time = f"{booking.get('booking_date')}T{booking.get('booking_time', '18:00:00')}"
    user_content = f"""<booking_details>
{json.dumps(booking, indent=2)}
</booking_details>

<chef_menu>
{json.dumps(menu, indent=2)}
</chef_menu>

Task: Generate a back-timed cooking timeline anchored to service at {service_time}.
Never overlap two heat-intensive steps. Use T-XXm format for times.

Return ONLY this JSON schema:
{{
  "booking_id": {booking['booking_id']},
  "service_at": "{service_time}",
  "timeline": [
    {{"time": "T-90m", "action": "task description", "dish": "dish name", "note": "optional note"}}
  ]
}}"""

    return [
        {"role": "user", "content": [
            {"type": "text", "text": SYSTEM_PROMPT,
             "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": user_content},
        ]}
    ]


def _build_substitution_messages(ingredient: str, reason: str,
                                 dietary: list[str]) -> list[dict]:
    user_content = f"""Task: Suggest 2-3 ranked substitutes for the following ingredient.

Ingredient to replace: {ingredient}
Reason for substitution: {reason}
Dietary restrictions to respect: {', '.join(dietary) if dietary else 'None'}

Return ONLY this JSON schema:
{{
  "original": "{ingredient}",
  "reason": "{reason}",
  "substitutions": [
    {{"substitute": "name", "ratio": "1:1", "notes": "brief note"}}
  ]
}}"""

    return [
        {"role": "user", "content": [
            {"type": "text", "text": SYSTEM_PROMPT,
             "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": user_content},
        ]}
    ]


def _build_plating_messages(booking: dict, menu: list[dict],
                            dish_id: int | None) -> list[dict]:
    if dish_id:
        target_menu = [m for m in menu if m["id"] == dish_id]
    else:
        target_menu = menu

    user_content = f"""<booking_details>
{json.dumps(booking, indent=2)}
</booking_details>

<dishes_to_plate>
{json.dumps(target_menu, indent=2)}
</dishes_to_plate>

Task: Generate plating guidance for each dish. Include style descriptor, step-by-step
plating instructions, and 1-3 garnish suggestions.

Return ONLY this JSON schema:
{{
  "booking_id": {booking['booking_id']},
  "plating": [
    {{
      "dish_name": "dish name",
      "style": "one-line style descriptor",
      "steps": ["step 1", "step 2"],
      "garnishes": ["garnish 1", "garnish 2"]
    }}
  ]
}}"""

    return [
        {"role": "user", "content": [
            {"type": "text", "text": SYSTEM_PROMPT,
             "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": user_content},
        ]}
    ]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _load_and_verify_booking(conn, chef_user_id: int, booking_id: int):
    """Load booking and verify chef owns it. Returns (chef_id, booking)."""
    chef_id = _get_chef_id_for_user(conn, chef_user_id)
    if not chef_id:
        raise PermissionError("Chef profile not found for this user")

    booking = _get_booking(conn, booking_id)
    if not booking:
        raise ValueError(f"Booking {booking_id} not found")

    if booking["chef_id"] != chef_id:
        raise PermissionError("This booking doesn't belong to you")

    return chef_id, booking


def generate_prep_list(chef_user_id: int, booking_id: int) -> dict:
    conn = get_db_connection()
    try:
        chef_id, booking = _load_and_verify_booking(conn, chef_user_id, booking_id)
        menu = _get_chef_menu(conn, chef_id)
        messages = _build_prep_list_messages(booking, menu)
        result, usage = call_llm(messages, model=DEFAULT_MODEL)
        _persist_session(conn, chef_id, booking_id, "prep_list",
                         {"booking_id": booking_id}, result, DEFAULT_MODEL, usage)
        return {"data": result, "usage": usage}
    finally:
        conn.close()


def generate_timeline(chef_user_id: int, booking_id: int) -> dict:
    conn = get_db_connection()
    try:
        chef_id, booking = _load_and_verify_booking(conn, chef_user_id, booking_id)
        menu = _get_chef_menu(conn, chef_id)
        messages = _build_timeline_messages(booking, menu)
        result, usage = call_llm(messages, model=DEFAULT_MODEL)
        _persist_session(conn, chef_id, booking_id, "timeline",
                         {"booking_id": booking_id}, result, DEFAULT_MODEL, usage)
        return {"data": result, "usage": usage}
    finally:
        conn.close()


def generate_substitutions(chef_user_id: int, ingredient: str,
                           reason: str, dietary_restrictions: list) -> dict:
    conn = get_db_connection()
    try:
        chef_id = _get_chef_id_for_user(conn, chef_user_id)
        if not chef_id:
            raise PermissionError("Chef profile not found")
        messages = _build_substitution_messages(ingredient, reason, dietary_restrictions)
        result, usage = call_llm(messages, model=FAST_MODEL)
        _persist_session(conn, chef_id, None, "substitutions",
                         {"ingredient": ingredient, "reason": reason},
                         result, FAST_MODEL, usage)
        return {"data": result, "usage": usage}
    finally:
        conn.close()


def generate_plating(chef_user_id: int, booking_id: int,
                     dish_id: int | None = None) -> dict:
    conn = get_db_connection()
    try:
        chef_id, booking = _load_and_verify_booking(conn, chef_user_id, booking_id)
        menu = _get_chef_menu(conn, chef_id)
        messages = _build_plating_messages(booking, menu, dish_id)
        result, usage = call_llm(messages, model=DEFAULT_MODEL)
        _persist_session(conn, chef_id, booking_id, "plating",
                         {"booking_id": booking_id, "dish_id": dish_id},
                         result, DEFAULT_MODEL, usage)
        return {"data": result, "usage": usage}
    finally:
        conn.close()


def get_sessions(chef_user_id: int, booking_id: int) -> dict:
    conn = get_db_connection()
    try:
        chef_id = _get_chef_id_for_user(conn, chef_user_id)
        if not chef_id:
            raise PermissionError("Chef profile not found")
        booking = _get_booking(conn, booking_id)
        if not booking:
            return {}
        if booking["chef_id"] != chef_id:
            raise PermissionError("This booking doesn't belong to you")
        return _get_latest_sessions(conn, chef_id, booking_id)
    finally:
        conn.close()