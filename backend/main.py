"""ASGI entry point: python -m uvicorn backend.main:app --port 4000"""

from .app import create_app

app = create_app()
