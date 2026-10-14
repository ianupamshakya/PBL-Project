# outside

outside turns the **Social Network Recommendation Engine** report into a web application. The backend and recommendation engine are written in **Python**, matching the report's graph approach: users are nodes, accepted connections are two-way edges, and friends of friends are ranked by mutual-connection count. Shared hashtags add another signal when a member has few connections.

## What members can do

1. Register with a private email and choose 3–8 hashtags.
2. Discover members through hashtags only. Discovery never includes names, aliases, email, or messages.
3. Send interest. The recipient can accept or decline after seeing only the sender's hashtags.
4. Chat after acceptance. Generated aliases appear only once both members connect; email stays private.
5. Block a member or submit a private report from a conversation.

## Stack

- **Python:** FastAPI, PyMongo, bcrypt, PyJWT, and a dictionary/set graph recommendation module
- **Frontend:** Vite, React, Tailwind CSS, and Lucide icons
- **Database:** MongoDB
- **Development tooling:** Node.js starts Vite and, for the optional demo, a temporary MongoDB instance. It does not run the API.

## Setup

Requires Python 3.13+, Node.js 20+, and MongoDB 7+ for persistent data. From the project root:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
npm install
```

### Quick demo

```sh
npm run dev:demo
```

This starts the Python API, Vite, and a **temporary MongoDB**. Open **http://localhost:5173**. Demo accounts are `demo1@example.test` through `demo5@example.test`, password `DemoPass123!`. Demo data is erased when the command stops. The MongoDB test binary may download on first use.

### Persistent MongoDB

Start MongoDB with `docker compose up -d mongo`, use a local installation, or set a MongoDB Atlas URI. Then:

```sh
cp .env.example .env
# Edit MONGODB_URI and replace JWT_SECRET with a long random value.
npm run dev
```

Vite runs at **http://localhost:5173** and proxies `/api` to the Python server at **http://localhost:4000**. To load disposable sample accounts into a development database, run `npm run seed`.

For a single-host deployment, run `npm run build`, set `APP_ENV=production`, `CLIENT_ORIGIN` to the public HTTPS origin, and `MONGODB_URI` and `JWT_SECRET` to production values, then run `npm start`. The Python server serves the built frontend and API. Use HTTPS so session cookies remain secure.

## Verification

```sh
npm test
npm run test:integration
npm run build
```

Python tests cover the graph algorithm and API permissions. The integration test starts a temporary real MongoDB and tests the Python API from registration through discovery, interest, acceptance, messaging, and blocking.

## Data and privacy

MongoDB collections are `users`, `connections`, `messages`, and `reports`. The Python API preserves the previous collection names and fields, so existing MongoDB records remain compatible. Passwords are bcrypt-hashed. Sessions use signed JWTs in HTTP-only cookies. The server checks both sides of a block before showing a connection or message. Reports are stored for operator review; this student project does not include automated moderation or crisis support.

The default database is now `outside`. If you already have data in another database, keep its existing `MONGODB_URI` or migrate those collections before using the new default. Existing browser sessions must sign in again because the session cookie was renamed.

## Key files

- `backend/recommendations.py` — Python dictionary/set social graph and ranking
- `backend/app.py` — FastAPI routes and privacy rules
- `backend/seed.py` — optional demo data
- `backend/tests/` — Python unit and API tests
- `client/` — Vite/React/Tailwind interface
