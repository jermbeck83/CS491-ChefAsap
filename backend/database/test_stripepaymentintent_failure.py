import requests
from test_scripts import BASE_URL, TEST_JWT_TOKEN, TEST_CUSTOMER_ID, TEST_BOOKING_ID

if not TEST_JWT_TOKEN:
    print("❌ ERROR: You must set TEST_JWT_TOKEN in your .env file to run this test.")
    exit(1)

url = f"{BASE_URL}/stripe-payment/create-payment-intent"
headers = {
    "Authorization": f"Bearer {TEST_JWT_TOKEN}",
    "Content-Type": "application/json"
}

print("--- TESTING STRIPE API FAILURES ---")

# Test 1: Attempting to checkout a booking that doesn't exist
print("\nTest 1: Sending a fake booking ID (Database security test)...")
payload_fake_booking = {
    "booking_id": 999999, # This ID does not exist in your database
    "customer_id": TEST_CUSTOMER_ID,
    "payment_method_id": "pm_card_visa",
    "currency": "usd"
}
res1 = requests.post(url, json=payload_fake_booking, headers=headers)
print(f"Status Code: {res1.status_code} | Response: {res1.json()}")

# Test 2: Forgetting the Stripe Customer ID
print("\nTest 2: Missing customer_id payload...")
payload_missing_customer = {
    "booking_id": TEST_BOOKING_ID, 
    "payment_method_id": "pm_card_visa",
    "currency": "usd"
}
res2 = requests.post(url, json=payload_missing_customer, headers=headers)
print(f"Status Code: {res2.status_code} | Response: {res2.json()}")

# Test 3: Bypassing the JWT Token (Authentication test)
print("\nTest 3: Attempting to hit the route without logging in...")
bad_headers = {"Content-Type": "application/json"}
payload_valid = {
    "booking_id": TEST_BOOKING_ID,
    "customer_id": TEST_CUSTOMER_ID,
    "payment_method_id": "pm_card_visa",
    "currency": "usd"
}
res3 = requests.post(url, json=payload_valid, headers=bad_headers)
print(f"Status Code: {res3.status_code} | Response: {res3.json()}")