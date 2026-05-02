import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.ensemble import RandomForestRegressor
import os

# Load dataset
file_path = "ml/exports/2026-04-04_212821/demand_forecast.csv"
df = pd.read_csv(file_path)

print("Dataset loaded:", df.shape)

# -------------------------
# Select features + target
# -------------------------

target = "total_bookings"

features = [
    "day_of_week",
    "month",
    "cuisine_type",
    "meal_type",
    "city",
    "search_volume",
    "unique_customers",
    "avg_booking_cost"
]

df = df[features + [target]].dropna()

# -------------------------
# Encode categorical data
# -------------------------

df = pd.get_dummies(df, columns=[
    "cuisine_type",
    "meal_type",
    "city"
])

# -------------------------
# Split data
# -------------------------

X = df.drop(columns=[target])
y = df[target]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# -------------------------
# Train model
# -------------------------

model = RandomForestRegressor(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

# -------------------------
# Evaluate
# -------------------------

preds = model.predict(X_test)

mae = mean_absolute_error(y_test, preds)
r2 = r2_score(y_test, preds)

print("\nModel Performance:")
print("MAE:", mae)
print("R2:", r2)

# -------------------------
# Save model
# -------------------------

import joblib

os.makedirs("ml/models", exist_ok=True)

joblib.dump(model, "ml/models/demand_model.joblib")

print("\nModel saved to ml/models/demand_model.joblib")

# -------------------------
# Feature Importance
# -------------------------

import pandas as pd

feature_importance = pd.DataFrame({
    "feature": X.columns,
    "importance": model.feature_importances_
}).sort_values(by="importance", ascending=False)

print("\nTop Features Driving Demand:")
print(feature_importance.head(10))