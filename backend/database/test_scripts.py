import os
from dotenv import load_dotenv

# Load environment variables from the main backend/.env file
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(backend_dir, '.env'))

# 1. Server URL (Defaults to localhost if not specified in .env)
BASE_URL = os.getenv("TEST_API_URL", "http://localhost:3000")

# 2. Database IDs (Defaults to your current IDs so they still work for you)
TEST_CUSTOMER_ID = int(os.getenv("TEST_CUSTOMER_ID", 45))
TEST_CHEF_ID = int(os.getenv("TEST_CHEF_ID", 12))
TEST_BOOKING_ID = int(os.getenv("TEST_BOOKING_ID", 1))

# 3. Security Tokens (No default, forces the developer to provide their own)
TEST_JWT_TOKEN = os.getenv("TEST_JWT_TOKEN", "")