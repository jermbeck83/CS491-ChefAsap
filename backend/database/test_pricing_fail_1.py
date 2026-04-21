import requests
from test_scripts import BASE_URL, TEST_CUSTOMER_ID, TEST_CHEF_ID

url = f"{BASE_URL}/api/v1/pricing/quote"

print("--- TESTING PRICING API FAILURES ---")

# Test 1: Missing Required Fields
print("\nTest 1: Forgetting to send the base_price...")
payload_missing = {
    "event_date": "2026-05-15T19:00:00Z", 
    "location_zip": "10001",
    "chef_id": TEST_CHEF_ID,
    "customer_id": TEST_CUSTOMER_ID
}
res1 = requests.post(url, json=payload_missing)
print(f"Status Code: {res1.status_code} | Response: {res1.json()}")

# Test 2: Invalid Date Format (Server crashing data)
print("\nTest 2: Sending plain text instead of an ISO date...")
payload_bad_date = {
    "base_price": 150.00,
    "event_date": "Next Tuesday", # The engine expects 2026-05-15T...
    "location_zip": "10001",
    "chef_id": TEST_CHEF_ID,
    "customer_id": TEST_CUSTOMER_ID
}
res2 = requests.post(url, json=payload_bad_date)
print(f"Status Code: {res2.status_code} | Response: {res2.json()}")