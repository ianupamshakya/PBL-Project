"""Create repeatable, explicitly optional development demo accounts."""

import os
from datetime import datetime, timezone
from pathlib import Path

import bcrypt
from dotenv import load_dotenv
from pymongo import MongoClient

from .recommendations import pair_key


load_dotenv(Path(__file__).resolve().parent.parent / ".env")
SAMPLES = [
    ("Gentle Fern 201", ["books", "coffee", "quiet walks", "poetry"]),
    ("Curious Moon 302", ["music", "art", "slow mornings", "stargazing"]),
    ("Warm Robin 403", ["books", "music", "nature", "deep talks"]),
    ("Soft River 504", ["gaming", "movies", "cooking", "coffee"]),
    ("Kind Willow 605", ["plants", "pets", "quiet walks", "journaling"]),
]


def seed_database(db):
    password_hash = bcrypt.hashpw(b"DemoPass123!", bcrypt.gensalt(rounds=12)).decode()
    now = datetime.now(timezone.utc)
    users = []
    for index, (alias, tags) in enumerate(SAMPLES, start=1):
        email = f"demo{index}@example.test"
        db.users.update_one({"email": email}, {"$setOnInsert": {"email": email, "passwordHash": password_hash, "alias": alias, "tags": tags, "blockedUsers": [], "createdAt": now, "updatedAt": now}}, upsert=True)
        users.append(db.users.find_one({"email": email}))
    for first, second in ((0, 1), (1, 2), (2, 3), (3, 4)):
        requester, recipient = users[first]["_id"], users[second]["_id"]
        db.connections.update_one({"pairKey": pair_key(requester, recipient)}, {"$setOnInsert": {"pairKey": pair_key(requester, recipient), "requester": requester, "recipient": recipient, "status": "accepted", "createdAt": now, "updatedAt": now}}, upsert=True)


def main():
    if (os.getenv("APP_ENV") or os.getenv("NODE_ENV")) == "production":
        raise SystemExit("Demo data cannot be seeded in production.")
    uri = os.getenv("MONGODB_URI")
    if not uri:
        raise SystemExit("Set MONGODB_URI in .env first.")
    client = MongoClient(uri, serverSelectionTimeoutMS=10000)
    try:
        client.admin.command("ping")
        seed_database(client.get_default_database(default="outside"))
        print("Demo accounts ready: demo1@example.test through demo5@example.test, password DemoPass123!")
    finally:
        client.close()


if __name__ == "__main__":
    main()
