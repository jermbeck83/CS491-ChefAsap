from datetime import datetime, timezone, timedelta
from database.db_helper import get_db_connection, get_cursor

class FraudDetectionEngine:
    def __init__(self):
        #  Heuristic weights 
        self.risk_weights = {
            "new_account": 25,              # Account created < 24 hours ago
            "high_value_transaction": 20,   # Order > $500
            "velocity_spike": 30,           # > 2 bookings in 24 hours
            "zip_code_mismatch": 15         # User's registered zip != event zip
        }

    def evaluate_transaction_risk(self, customer_id, amount_cents, event_zip):
        """
        Evaluates a transaction and returns a risk score (0-100) and triggered flags.
        """
        risk_score = 0.0
        flags_triggered = {}
        
        conn = None
        cursor = None
        try:
            conn = get_db_connection()
            cursor = get_cursor(conn, dictionary=True)
            
           
            cursor.execute("SELECT created_at FROM users WHERE id = %s", (customer_id,))
            user = cursor.fetchone()
            
            if user and user.get('created_at'):
                # Handle naive datetime from DB by making it aware if needed
                created_at = user['created_at']
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=timezone.utc)
                    
                account_age_hours = (datetime.now(timezone.utc) - created_at).total_seconds() / 3600
                if account_age_hours < 24:
                    risk_score += self.risk_weights["new_account"]
                    flags_triggered["new_account"] = True

            # 2. Check Transaction Velocity (Sudden spam of bookings)
            cursor.execute("""
                SELECT COUNT(*) as recent_bookings 
                FROM bookings 
                WHERE customer_id = %s AND created_at >= NOW() - INTERVAL '24 hours'
            """, (customer_id,))
            velocity = cursor.fetchone()
            
            if velocity and velocity['recent_bookings'] >= 2:
                risk_score += self.risk_weights["velocity_spike"]
                flags_triggered["velocity_spike"] = velocity['recent_bookings']

            # 3. High Value Check
            amount_dollars = amount_cents / 100.0
            if amount_dollars > 500.00:
                risk_score += self.risk_weights["high_value_transaction"]
                flags_triggered["high_value"] = amount_dollars

            # Cap the score at 100
            final_score = min(risk_score, 100.0)
            
            return {
                "fraud_score": final_score,
                "is_flagged": final_score >= 60.0, # Threshold to block or review
                "flags": flags_triggered
            }

        except Exception as e:
            print(f"Error evaluating fraud risk: {e}")
            # Fail open so users can still check out if the engine hiccups
            return {"fraud_score": 0.0, "is_flagged": False, "flags": {"error": str(e)}}
        finally:
            if cursor: cursor.close()
            if conn: conn.close()