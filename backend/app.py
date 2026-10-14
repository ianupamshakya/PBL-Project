"""Python API for outside. Public discovery only returns hashtags."""

import logging
import os
import re
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import bcrypt
import jwt
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import Body, Depends, FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pymongo import MongoClient, ReturnDocument
from pymongo.errors import DuplicateKeyError

from .recommendations import SUGGESTED_TAGS, normalize_tags, pair_key, recommend


ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
LOGGER = logging.getLogger(__name__)
FIRST_NAMES = ("Quiet", "Gentle", "Kind", "Soft", "Warm", "Calm", "Brave", "Curious")
SECOND_NAMES = ("Comet", "Fern", "Moon", "River", "Willow", "Robin", "Cloud", "Sparrow")
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class ApiError(Exception):
    def __init__(self, message, status=400):
        self.message = message
        self.status = status


def make_alias():
    return f"{secrets.choice(FIRST_NAMES)} {secrets.choice(SECOND_NAMES)} {secrets.randbelow(900) + 100}"


def own_user(user):
    return {"id": str(user["_id"]), "email": user["email"], "alias": user["alias"], "tags": user.get("tags", [])}


def person(user):
    return {"id": str(user["_id"]), "alias": user["alias"], "tags": user.get("tags", [])}


def iso_date(value):
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


def parse_id(value, message="Invalid person."):
    if not ObjectId.is_valid(value):
        raise ApiError(message)
    return ObjectId(value)


def create_app(db=None, *, secret=None, origin=None, production=None):
    """Create the application. Injecting a database makes API tests independent."""
    production = ((os.getenv("APP_ENV") or os.getenv("NODE_ENV")) == "production") if production is None else production
    secret = secret or os.getenv("JWT_SECRET")
    if not secret or len(secret) < 32 or (production and secret == "replace-with-a-long-random-secret-at-least-32-characters"):
        raise RuntimeError("Set a JWT_SECRET of at least 32 characters in .env.")
    origin = origin or os.getenv("CLIENT_ORIGIN") or ("http://localhost:4000" if production else "http://localhost:5173")

    client = None
    if db is None:
        uri = os.getenv("MONGODB_URI")
        if not uri:
            raise RuntimeError("Set MONGODB_URI in .env.")
        client = MongoClient(uri, serverSelectionTimeoutMS=10000)
        client.admin.command("ping")
        db = client.get_default_database(default="outside")

    db.users.create_index("email", unique=True)
    db.connections.create_index("pairKey", unique=True)
    db.connections.create_index([("requester", 1), ("status", 1)])
    db.connections.create_index([("recipient", 1), ("status", 1)])
    db.messages.create_index([("connection", 1), ("createdAt", 1)])

    app = FastAPI(title="outside API", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.db = db
    app.state.client = client
    app.add_middleware(CORSMiddleware, allow_origins=[origin], allow_credentials=True, allow_methods=["GET", "POST", "PATCH"], allow_headers=["Content-Type"])

    auth_attempts = {}
    auth_lock = threading.Lock()

    @app.middleware("http")
    async def request_guard(request: Request, call_next):
        if request.url.path.startswith("/api/"):
            if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
                supplied_origin = request.headers.get("origin")
                if supplied_origin and supplied_origin != origin:
                    return JSONResponse({"error": "Invalid request origin."}, status_code=403)
            if int(request.headers.get("content-length", "0") or 0) > 20_480:
                return JSONResponse({"error": "Request is too large."}, status_code=413)
            if request.url.path in {"/api/auth/register", "/api/auth/login"} and request.method == "POST":
                now = time.monotonic()
                key = request.client.host if request.client else "unknown"
                with auth_lock:
                    attempts = [stamp for stamp in auth_attempts.get(key, ()) if now - stamp < 900]
                    if len(attempts) >= 30:
                        return JSONResponse({"error": "Too many attempts. Try again later."}, status_code=429)
                    attempts.append(now)
                    auth_attempts[key] = attempts
        return await call_next(request)

    @app.exception_handler(ApiError)
    async def api_error_handler(_request, error: ApiError):
        return JSONResponse({"error": error.message}, status_code=error.status)

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_request, _error):
        return JSONResponse({"error": "Check the request details and try again."}, status_code=400)

    @app.exception_handler(Exception)
    async def internal_error_handler(_request, error):
        LOGGER.exception("API request failed", exc_info=error)
        return JSONResponse({"error": "Something went wrong. Please try again."}, status_code=500)

    def current_user(request: Request):
        token = request.cookies.get("outside_session")
        if not token:
            raise ApiError("Please sign in to continue.", 401)
        try:
            payload = jwt.decode(token, secret, algorithms=["HS256"])
            user_id = parse_id(payload["sub"])
            user = db.users.find_one({"_id": user_id})
        except (jwt.InvalidTokenError, KeyError, ValueError, ApiError):
            user = None
        if user is None:
            raise ApiError("Your session has expired. Please sign in again.", 401)
        return user

    def set_session(response: Response, user_id):
        token = jwt.encode({"sub": str(user_id), "exp": datetime.now(timezone.utc) + timedelta(days=7)}, secret, algorithm="HS256")
        response.set_cookie("outside_session", token, max_age=604800, httponly=True, secure=production, samesite="lax", path="/")

    def accepted_connection(connection_id, user):
        connection_id = parse_id(connection_id, "Invalid conversation.")
        item = db.connections.find_one({"_id": connection_id, "status": "accepted", "$or": [{"requester": user["_id"]}, {"recipient": user["_id"]}]})
        if item is None:
            raise ApiError("Conversation not found.", 404)
        other_id = item["recipient"] if item["requester"] == user["_id"] else item["requester"]
        other = db.users.find_one({"_id": other_id})
        if other is None or other_id in user.get("blockedUsers", []) or user["_id"] in other.get("blockedUsers", []):
            raise ApiError("Conversation unavailable.", 403)
        return item, other

    @app.get("/api/health")
    def health():
        if client is not None:
            try:
                client.admin.command("ping")
            except Exception:
                return {"ok": False, "database": "disconnected"}
        return {"ok": True, "database": "connected"}

    @app.get("/api/tags")
    def tags():
        return {"tags": SUGGESTED_TAGS}

    @app.post("/api/auth/register", status_code=201)
    def register(response: Response, payload: dict = Body(default_factory=dict)):
        email = str(payload.get("email") or "").strip().lower()
        password = str(payload.get("password") or "")
        selected_tags = normalize_tags(payload.get("tags"))
        if len(email) > 254 or not EMAIL_PATTERN.fullmatch(email):
            raise ApiError("Enter a valid email address.")
        if not 8 <= len(password) <= 128:
            raise ApiError("Use a password with 8 to 128 characters.")
        if len(selected_tags) < 3:
            raise ApiError("Choose at least three hashtags.")
        now = datetime.now(timezone.utc)
        user = {"email": email, "passwordHash": bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode(), "alias": make_alias(), "tags": selected_tags, "blockedUsers": [], "createdAt": now, "updatedAt": now}
        try:
            user["_id"] = db.users.insert_one(user).inserted_id
        except DuplicateKeyError:
            raise ApiError("An account with this email already exists.", 409) from None
        set_session(response, user["_id"])
        return {"user": own_user(user)}

    @app.post("/api/auth/login")
    def login(response: Response, payload: dict = Body(default_factory=dict)):
        email = str(payload.get("email") or "").strip().lower()
        password = str(payload.get("password") or "")
        user = db.users.find_one({"email": email})
        if user is None or not bcrypt.checkpw(password.encode(), user["passwordHash"].encode()):
            raise ApiError("Email or password is incorrect.", 401)
        set_session(response, user["_id"])
        return {"user": own_user(user)}

    @app.post("/api/auth/logout")
    def logout(response: Response):
        response.delete_cookie("outside_session", path="/")
        return {"ok": True}

    @app.get("/api/auth/me")
    def me(user=Depends(current_user)):
        return {"user": own_user(user)}

    @app.patch("/api/profile")
    def update_profile(payload: dict = Body(default_factory=dict), user=Depends(current_user)):
        selected_tags = normalize_tags(payload.get("tags"))
        if len(selected_tags) < 3:
            raise ApiError("Choose at least three hashtags.")
        db.users.update_one({"_id": user["_id"]}, {"$set": {"tags": selected_tags, "updatedAt": datetime.now(timezone.utc)}})
        user["tags"] = selected_tags
        return {"user": own_user(user)}

    @app.get("/api/discover")
    def discover(user=Depends(current_user)):
        users = list(db.users.find({}, {"tags": 1, "blockedUsers": 1}))
        connections = list(db.connections.find({}, {"requester": 1, "recipient": 1, "status": 1}))
        blocked_by_others = [item["_id"] for item in users if user["_id"] in item.get("blockedUsers", [])]
        blocked = [*user.get("blockedUsers", []), *blocked_by_others]
        suggestions = recommend(user["_id"], users, [item for item in connections if item.get("status") == "accepted"], connections, blocked)
        return {"suggestions": suggestions[:60]}

    @app.get("/api/connections")
    def connections(user=Depends(current_user)):
        cursor = db.connections.find({"$or": [{"requester": user["_id"]}, {"recipient": user["_id"]}]}).sort("updatedAt", -1)
        result = []
        for item in cursor:
            mine = item["requester"] == user["_id"]
            other = db.users.find_one({"_id": item["recipient"] if mine else item["requester"]})
            if other is None or other["_id"] in user.get("blockedUsers", []) or user["_id"] in other.get("blockedUsers", []):
                continue
            result.append({
                "id": str(item["_id"]),
                "status": item["status"],
                "direction": "outgoing" if mine else "incoming",
                "person": person(other) if item["status"] == "accepted" else {"id": str(other["_id"]), "tags": other.get("tags", [])},
                "updatedAt": iso_date(item.get("updatedAt")),
            })
        return {"connections": result}

    @app.post("/api/interests/{user_id}", status_code=201)
    def send_interest(user_id: str, user=Depends(current_user)):
        target_id = parse_id(user_id, "Choose another person.")
        if target_id == user["_id"]:
            raise ApiError("Choose another person.")
        target = db.users.find_one({"_id": target_id})
        if target is None:
            raise ApiError("This person is no longer available.", 404)
        if target_id in user.get("blockedUsers", []) or user["_id"] in target.get("blockedUsers", []):
            raise ApiError("This person is unavailable.", 403)
        now = datetime.now(timezone.utc)
        try:
            result = db.connections.insert_one({"pairKey": pair_key(user["_id"], target_id), "requester": user["_id"], "recipient": target_id, "status": "pending", "createdAt": now, "updatedAt": now})
        except DuplicateKeyError:
            raise ApiError("An interest or connection already exists.", 409) from None
        return {"id": str(result.inserted_id), "status": "pending"}

    @app.patch("/api/connections/{connection_id}")
    def respond(connection_id: str, payload: dict = Body(default_factory=dict), user=Depends(current_user)):
        item_id = parse_id(connection_id, "Invalid request.")
        action = payload.get("action")
        if action not in {"accept", "decline"}:
            raise ApiError("Choose accept or decline.")
        item = db.connections.find_one({"_id": item_id, "recipient": user["_id"], "status": "pending"})
        if item is None:
            raise ApiError("This request is no longer available.", 404)
        requester = db.users.find_one({"_id": item["requester"]})
        if requester is None or item["requester"] in user.get("blockedUsers", []) or user["_id"] in requester.get("blockedUsers", []):
            raise ApiError("This request is no longer available.", 404)
        status = "accepted" if action == "accept" else "declined"
        changed = db.connections.find_one_and_update({"_id": item_id, "recipient": user["_id"], "status": "pending"}, {"$set": {"status": status, "updatedAt": datetime.now(timezone.utc)}}, return_document=ReturnDocument.AFTER)
        if changed is None:
            raise ApiError("This request is no longer available.", 404)
        return {"status": status}

    @app.get("/api/connections/{connection_id}/messages")
    def messages(connection_id: str, user=Depends(current_user)):
        item, other = accepted_connection(connection_id, user)
        cursor = db.messages.find({"connection": item["_id"]}).sort("createdAt", -1).limit(100)
        content = list(cursor)[::-1]
        return {"person": person(other), "messages": [{"id": str(message["_id"]), "mine": message["sender"] == user["_id"], "text": message["text"], "createdAt": iso_date(message.get("createdAt"))} for message in content]}

    @app.post("/api/connections/{connection_id}/messages", status_code=201)
    def send_message(connection_id: str, payload: dict = Body(default_factory=dict), user=Depends(current_user)):
        item, _other = accepted_connection(connection_id, user)
        text = str(payload.get("text") or "").strip()
        if not 1 <= len(text) <= 1000:
            raise ApiError("Message must be between 1 and 1000 characters.")
        now = datetime.now(timezone.utc)
        result = db.messages.insert_one({"connection": item["_id"], "sender": user["_id"], "text": text, "createdAt": now, "updatedAt": now})
        return {"message": {"id": str(result.inserted_id), "mine": True, "text": text, "createdAt": iso_date(now)}}

    @app.post("/api/block/{user_id}")
    def block(user_id: str, user=Depends(current_user)):
        target_id = parse_id(user_id)
        if target_id == user["_id"]:
            raise ApiError("Invalid person.")
        db.users.update_one({"_id": user["_id"]}, {"$addToSet": {"blockedUsers": target_id}, "$set": {"updatedAt": datetime.now(timezone.utc)}})
        return {"ok": True}

    @app.post("/api/report/{user_id}", status_code=201)
    def report(user_id: str, payload: dict = Body(default_factory=dict), user=Depends(current_user)):
        target_id = parse_id(user_id)
        reason = str(payload.get("reason") or "").strip()
        if target_id == user["_id"] or not 1 <= len(reason) <= 500:
            raise ApiError("Add a short reason for your report.")
        now = datetime.now(timezone.utc)
        db.reports.insert_one({"reporter": user["_id"], "reported": target_id, "reason": reason, "createdAt": now, "updatedAt": now})
        return {"ok": True}

    if production:
        dist = ROOT / "client" / "dist"
        if not dist.is_dir():
            raise RuntimeError("Build the frontend with npm run build before production startup.")
        app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")

    return app
