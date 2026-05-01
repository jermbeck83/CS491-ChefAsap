import requests
import os
from dotenv import load_dotenv  
load_dotenv()  # Load environment variables from .env file

#  Enter the credentials of any user in your database in the .env file (TEST_EMAIL and TEST_PASSWORD)
email = os.environ.get('TEST_EMAIL')
password = os.environ.get('TEST_PASSWORD')

url = "https://your_dbase_name_on_render.onrender.com/auth/signin" # Update with your actual Render URL and endpoint if different
payload = {
    "email": email,
    "password": password
}

print(f"Logging in as {email}...")
response = requests.post(url, json=payload)

if response.status_code == 200:
    token = response.json().get('token')
    print("\n LOGIN SUCCESSFUL. HERE IS YOUR TOKEN:\n")
    print(token)
    print("\n" + "-"*50)
else:
    print("Failed to log in:", response.text)