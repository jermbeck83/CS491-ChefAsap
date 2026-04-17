from database.db_helper import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()

cursor.execute("""
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS base_price DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS dynamic_price DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS pricing_multiplier DECIMAL(4, 2),
ADD COLUMN IF NOT EXISTS pricing_features JSONB;
""")

conn.commit()
cursor.close()
conn.close()
print("Columns added successfully!")