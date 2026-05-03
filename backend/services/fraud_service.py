from datetime import datetime, timezone, timedelta
from database.db_helper import get_db_connection, get_cursor

class FraudDetectionEngine:
    def __init__(self):
        # Heuristic weights 
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
            
            print(f"\n--- 🕵️ FRAUD ENGINE RUNNING FOR ID: {customer_id} ---")
            
            #  NEW ACCOUNT CHECK (FIXED: Querying the 'customers' table directly)
            cursor.execute("SELECT created_at FROM customers WHERE id = %s", (customer_id,))
            customer = cursor.fetchone()
            
            if customer and customer.get('created_at'):
                created_at = customer['created_at']
                
                # Make timezone-aware to prevent calculation bugs
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=timezone.utc)
                    
                account_age_hours = (datetime.now(timezone.utc) - created_at).total_seconds() / 3600
                print(f"⏱️ Account Age: {account_age_hours:.2f} hours")
                
                # Use abs() to prevent timezone offset bugs resulting in negative hours
                if abs(account_age_hours) < 24:
                    print("🚩 FLAG TRIGGERED: New Account (+25 pts)")
                    risk_score += self.risk_weights["new_account"]
                    flags_triggered["new_account"] = True
            else:
                print("⚠️ WARNING: Could not find customer in database.")

            # VELOCITY CHECK
            cursor.execute("""
                SELECT COUNT(*) as recent_bookings 
                FROM bookings 
                WHERE customer_id = %s AND created_at >= NOW() - INTERVAL '24 hours'
            """, (customer_id,))
            velocity = cursor.fetchone()
            
            if velocity and velocity['recent_bookings'] >= 2:
                print(f"🚩 FLAG TRIGGERED: Velocity Spike ({velocity['recent_bookings']} bookings) (+30 pts)")
                risk_score += self.risk_weights["velocity_spike"]
                flags_triggered["velocity_spike"] = velocity['recent_bookings']

            # HIGH VALUE CHECK
            amount_dollars = amount_cents / 100.0
            if amount_dollars > 500.00:
                print(f"🚩 FLAG TRIGGERED: High Value (${amount_dollars:.2f}) (+20 pts)")
                risk_score += self.risk_weights["high_value_transaction"]
                flags_triggered["high_value"] = amount_dollars

            # 4. ZIP CODE MISMATCH CHECK
            # Query the customer's default address from the database
            cursor.execute("""
                SELECT zip_code 
                FROM customer_addresses 
                WHERE customer_id = %s AND is_default = TRUE
                LIMIT 1
            """, (customer_id,))
            address = cursor.fetchone()
            
            if address and address['zip_code'] and event_zip:
                # Clean strings just in case of whitespace or formatting
                registered_zip = str(address['zip_code']).strip()
                passed_zip = str(event_zip).strip()
                
                if registered_zip != passed_zip:
                    print(f"🚩 FLAG TRIGGERED: Zip Code Mismatch (Registered: {registered_zip}, Event: {passed_zip}) (+15 pts)")
                    risk_score += self.risk_weights["zip_code_mismatch"]
                    flags_triggered["zip_code_mismatch"] = {"registered": registered_zip, "event": passed_zip}

            # Cap the score at 100
            final_score = min(risk_score, 100.0)
            
            print(f"🛡️ FINAL RISK SCORE: {final_score}/100")
            print("--------------------------------------------------\n")
            
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