import sys
import os
from test_scripts import TEST_CUSTOMER_ID

# Get the directory of this script (tests/), then go up one level to (backend/)
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(backend_dir)

from services.fraud_service import FraudDetectionEngine

print("--- INITIATING FRAUD ENGINE TEST ---")
engine = FraudDetectionEngine()

# Test Case 1: Normal Transaction ($150)
print("\n[Test 1] Normal $150 Transaction...")
safe_result = engine.evaluate_transaction_risk(
    customer_id=TEST_CUSTOMER_ID, 
    amount_cents=15000, 
    event_zip="10001"
)
print(f"Risk Score: {safe_result['fraud_score']} / 100")
print(f"Is Blocked: {safe_result['is_flagged']}")
print(f"Flags Triggered: {safe_result['flags']}")

# Test Case 2: Suspicious High-Value Transaction ($800)
print("\n[Test 2] Suspicious $800 Transaction...")
fraud_result = engine.evaluate_transaction_risk(
    customer_id=TEST_CUSTOMER_ID, 
    amount_cents=80000, 
    event_zip="10001"
)
print(f"Risk Score: {fraud_result['fraud_score']} / 100")
print(f"Is Blocked: {fraud_result['is_flagged']}")
print(f"Flags Triggered: {fraud_result['flags']}")