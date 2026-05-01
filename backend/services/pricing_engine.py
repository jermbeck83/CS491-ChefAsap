from datetime import datetime
import holidays
from database.db_helper import get_db_connection, get_cursor

class DynamicPricingEngine:
    def __init__(self):
        # these weights will be loaded dynamically from your trained ML model (e.g., a pickle file)
        #  we use baseline heuristic weights to gather training data.
        self.weights = {
            "weekend": 1.15,
            "holiday": 1.25,
            "rush_fee_under_48h": 1.20,
            "rush_fee_under_24h": 1.40,
            "high_demand_neighborhood": 1.10,
            "high_scarcity": 1.15
        }
        self.us_holidays = holidays.US()

    def calculate_quote(self, base_price, event_date_str, location_zip, chef_id, customer_id):
        """
        Calculates the dynamic price based on 5 core ML features.
        """
        event_date = datetime.fromisoformat(event_date_str.replace("Z", "+00:00"))
        now = datetime.now(event_date.tzinfo)
        
        multiplier = 1.0
        features = {}

        # Feature 1: Holidays & Weekends
        if event_date.date() in self.us_holidays:
            multiplier *= self.weights["holiday"]
            features['is_holiday'] = True
        elif event_date.weekday() >= 5: # Saturday = 5, Sunday = 6
            multiplier *= self.weights["weekend"]
            features['is_weekend'] = True

        # Feature 2: Lead Time (Rush Pricing)
        hours_until_event = (event_date - now).total_seconds() / 3600
        if hours_until_event < 24:
            multiplier *= self.weights["rush_fee_under_24h"]
        elif hours_until_event < 48:
            multiplier *= self.weights["rush_fee_under_48h"]
        features['lead_time_hours'] = hours_until_event

        # Feature 3 & 4: Neighborhood Demand vs. Chef Scarcity
        supply_demand_ratio = self._get_supply_demand_ratio(location_zip, event_date)
        if supply_demand_ratio > 2.0: # High demand, low supply
            multiplier *= self.weights["high_scarcity"]
        features['supply_demand_ratio'] = supply_demand_ratio

        # Calculate Final Price
        final_price = round(base_price * multiplier, 2)
        
        return {
            "base_price": base_price,
            "final_price": final_price,
            "multiplier": round(multiplier, 2),
            "features_logged": features
        }

    def _get_supply_demand_ratio(self, zip_code, event_date):
        """
        Queries the database to calculate live neighborhood demand vs chef availability.
        Returns a ratio: (Recent Searches + Bookings) / Available Chefs.
        """
        conn = None
        cursor = None
        try:
            conn = get_db_connection()
            cursor = get_cursor(conn, dictionary=True)
            
            # Simplified query for demonstration: Combines analytics events with available users
            cursor.execute("""
                WITH demand AS (
                    SELECT COUNT(*) as demand_score
                    FROM app_events_log
                    WHERE event_action = 'search' 
                    AND event_data->>'zip_code' = %s
                    AND client_timestamp >= NOW() - INTERVAL '7 days'
                ),
                supply AS (
                    SELECT COUNT(id) as supply_score
                    FROM users
                    WHERE user_type = 'chef'
                    -- In production, join with a chef_availability table here
                )
                SELECT 
                    d.demand_score, 
                    GREATEST(s.supply_score, 1) as supply_score -- Prevent divide by zero
                FROM demand d CROSS JOIN supply s;
            """, (zip_code,))
            
            result = cursor.fetchone()
            if result:
                return result['demand_score'] / result['supply_score']
            return 1.0

        except Exception as e:
            print(f"Error calculating supply/demand: {e}")
            return 1.0
        finally:
            if cursor: cursor.close()
            if conn: conn.close()