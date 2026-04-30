import sys
import os

# Add backend/ to sys.path so imports like `from services.prompts...` resolve.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
