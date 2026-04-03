"""
ML Training Dataset Module for ChefAsap

Provides tools to extract, transform, and export ML-ready datasets
from the ChefAsap PostgreSQL database for training future AI models:
- Smart Matching Engine
- Personalized Recommendations
- Demand Forecasting
"""

__all__ = ['create_training_dataset', 'feature_queries', 'exporters']
