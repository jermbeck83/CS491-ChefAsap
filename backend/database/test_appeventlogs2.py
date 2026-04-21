import requests
import json
from test_scripts import BASE_URL

url = f"{BASE_URL}/metrics/unmet-demand"

print(f"Fetching data from {url}...")

try:
    response = requests.get(url)
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 200:
        print("\n--- Unmet Geographic Demand Data ---")
        print(json.dumps(response.json(), indent=2))
    else:
        print(f"Error Response: {response.text}")

except requests.exceptions.ConnectionError:
    print("Connection Error")