# Kinship

A quieter social connection app based on the **Social Network Recommendation Engine** report by team PsquareG. The report's graph model is preserved: accepted connections form two-way edges, and discovery ranks friends of friends by mutual-connection count. Shared hashtags add another relevance signal for people who do not have a network yet.

## How it works

1. Register with a private email and password, then choose 3–8 hashtags.
2. Discover other members through hashtags only. Names, aliases, email addresses, and messages are absent from discovery responses.
3. Send interest. The recipient sees the sender's hashtags only and can accept or decline.
4. Accepted connections reveal each person's random alias and unlock private chat. Email is never shared.
5. A member can block another member or submit a private report from a conversation.

## Stack

- Frontend: Vite, React, Tailwind CSS, Lucide icons
- API: Node.js, Express, Mongoose
- Database: MongoDB
- Sessions: signed JWT in an HTTP-only cookie; passwords hashed with bcrypt

## Run locally

Requires Node.js 20+ and MongoDB 7+. Docker Compose can start MongoDB with `docker compose up -d mongo`; alternatively use a local MongoDB server or MongoDB Atlas URI.

**Quick demo without installing MongoDB:** run `npm install` and then `npm run dev:demo`. This starts a temporary MongoDB, loads five demo accounts, and launches both servers. Demo data is erased when you stop the command. The MongoDB test binary is downloaded on first use.

```sh
cp .env.example .env
# Set JWT_SECRET to a unique random string of at least 32 characters.
npm install
npm run dev
```

The frontend is at **http://localhost:5173** and the API at **http://localhost:4000**. Vite proxies `/api` to Express. If using Atlas, set `MONGODB_URI` in `.env`. For a single-host deployment, run `npm run build` and `npm start`; Express serves the built frontend alongside the API. Set `CLIENT_ORIGIN` to the public HTTPS origin and `NODE_ENV=production` so the session cookie is secure.

For an optional local demonstration, run `npm run seed`. It creates five clearly disposable demo accounts in your configured development database (`demo1@example.test` through `demo5@example.test`, password `DemoPass123!`) with a few accepted connections. The seed is repeatable and refuses to run when `NODE_ENV=production`.

```sh
npm test
npm run test:integration
npm run build
```

## Privacy and safety

Discovery and pending requests serialize only user IDs and hashtags. The server checks that a connection is accepted before returning or storing messages, and checks blocks on both sides. Authentication routes are rate limited. Reports are stored in MongoDB for an operator to review. This is a student project and does not provide real-time crisis support or automated moderation.

## Project structure

- `client/` Vite app
- `server/src/models.js` MongoDB data model
- `server/src/logic.js` hashtag normalization and graph recommendation
- `server/src/index.js` API and authorization rules
- `server/test/` recommendation tests

The integration test starts a temporary MongoDB instance and may download its test binary the first time it runs.
