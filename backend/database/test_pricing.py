import requests
from test_scripts import BASE_URL, TEST_CUSTOMER_ID, TEST_CHEF_ID

url = f"{BASE_URL}/api/v1/pricing/quote"
payload = {
    "base_price": 150.00,
    "event_date": "2026-05-15T19:00:00Z", 
    "location_zip": "10001",
    "chef_id": TEST_CHEF_ID,
    "customer_id": TEST_CUSTOMER_ID
}

print(f"Sending Pricing Request to: {url}...")
response = requests.post(url, json=payload)
print(response.json())