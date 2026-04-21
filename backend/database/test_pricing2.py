import requests
from datetime import datetime, timedelta, timezone
from test_scripts import BASE_URL, TEST_CUSTOMER_ID, TEST_CHEF_ID

# Create a date exactly 12 hours from right now
rush_date = (datetime.now(timezone.utc) + timedelta(hours=12)).strftime('%Y-%m-%dT%H:%M:%SZ')

url = f"{BASE_URL}/api/v1/pricing/quote"
payload = {
    "base_price": 150.00,
    "event_date": rush_date, 
    "location_zip": "10001",
    "chef_id": TEST_CHEF_ID,
    "customer_id": TEST_CUSTOMER_ID
}

response = requests.post(url, json=payload)
print(response.json())