import requests
from test_scripts import BASE_URL, TEST_CUSTOMER_ID, TEST_CHEF_ID

url = f"{BASE_URL}/api/v1/analytics/log_event"

# The dummy payload using dynamic IDs
payload = {
    "event_category": "navigation",
    "event_action": "view_chef_profile",
    "actor_type": "customer",
    "actor_id": TEST_CUSTOMER_ID,
    "session_id": "test_script_run",
    "event_data": {
        "viewed_chef_id": TEST_CHEF_ID,
        "time_spent_seconds": 12
    }
}

print("Firing request to backend...")
response = requests.post(url, json=payload)

# Print the results
print(f"Status Code: {response.status_code}")
print(f"Response: {response.json()}")