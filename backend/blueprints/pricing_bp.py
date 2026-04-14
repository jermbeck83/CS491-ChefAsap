from flask import Blueprint, request, jsonify
from services.pricing_engine import DynamicPricingEngine

pricing_bp = Blueprint('pricing', __name__)
pricing_engine = DynamicPricingEngine()

@pricing_bp.route('/quote', methods=['POST'])
def get_price_quote():
    """
    Called by the frontend when a user selects a date and menu.
    Returns the dynamically adjusted price.
    """
    data = request.get_json()
    
    required_fields = ['base_price', 'event_date', 'location_zip', 'chef_id', 'customer_id']
    if not all(field in data for field in required_fields):
        return jsonify({"error": "Missing required fields"}), 400

    try:
        quote = pricing_engine.calculate_quote(
            base_price=float(data['base_price']),
            event_date_str=data['event_date'],
            location_zip=data['location_zip'],
            chef_id=data['chef_id'],
            customer_id=data['customer_id']
        )
        
        return jsonify({
            "status": "success",
            "quote": quote
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500