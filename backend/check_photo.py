import psycopg2
conn = psycopg2.connect('postgresql://chefasap_db_user:t2px3lrdYt7rbmrmPTN2zKayGAResK8i@dpg-d6muqvngi27c73c4ilq0-a.oregon-postgres.render.com/chefasap_db')
cur = conn.cursor()
cur.execute("SELECT photo_url FROM chefs WHERE id = 3")
row = cur.fetchone()
if row and row[0]:
    print('Length:', len(row[0]))
    print('Starts with:', row[0][:60])
else:
    print('NULL - no photo')
cur.execute("SELECT photo_url FROM customers WHERE id = 3")
row = cur.fetchone()
if row and row[0]:
    print('Customer length:', len(row[0]))
    print('Customer starts with:', row[0][:60])
else:
    print('Customer: NULL')
cur.close()
conn.close()
