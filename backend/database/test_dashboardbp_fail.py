import requests
from test_scripts import BASE_URL

url = f"{BASE_URL}/metrics/chef-performance"

print(f"Testing Method Failure on {url}...")

# Intentionally using POST on a GET-only route
response = requests.post(url, json={"data": "should not work"})

print(f"Status Code: {response.status_code}") 
# Expected: 405 Method Not Allowed