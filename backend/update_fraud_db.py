from database.db_helper import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()

# Add fraud tracking columns to bookings
cursor.execute("""
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS fraud_score DECIMAL(5, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS fraud_flags JSONB,
ADD COLUMN IF NOT EXISTS is_flagged_fraud BOOLEAN DEFAULT FALSE;
""")

conn.commit()
cursor.close()
conn.close()
print("Fraud detection columns added successfully!")