import requests
from test_scripts import BASE_URL

url = f"{BASE_URL}/api/v1/analytics/log_event"

# This payload is missing 'event_action', so it SHOULD fail
bad_payload = {
    "event_category": "interaction",
    "actor_type": "customer"
}

print(f"Testing failure on {url}...")
response = requests.post(url, json=bad_payload)

print(f"Status Code: {response.status_code}") # This should be 400
print(f"Response: {response.json()}")