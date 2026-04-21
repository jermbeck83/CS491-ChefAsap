import requests
from test_scripts import BASE_URL, TEST_JWT_TOKEN, TEST_BOOKING_ID, TEST_CUSTOMER_ID

if not TEST_JWT_TOKEN:
    print("❌ ERROR: You must set TEST_JWT_TOKEN in your .env file to run this test.")
    exit(1)

url = f"{BASE_URL}/stripe-payment/create-payment-intent"

headers = {
    "Authorization": f"Bearer {TEST_JWT_TOKEN}",
    "Content-Type": "application/json"
}

payload = {
    "booking_id": TEST_BOOKING_ID,
    "customer_id": TEST_CUSTOMER_ID,
    "payment_method_id": "pm_card_visa",
    "currency": "usd"
}

print(f"Sending secure request to Stripe via {url}...")
response = requests.post(url, json=payload, headers=headers)

print("Status Code:", response.status_code)
print("Response JSON:", response.json())