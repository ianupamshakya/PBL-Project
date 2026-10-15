# outside

**outside** is a BCA project based learning application for people who prefer a gentle way to meet others online. A person chooses hashtags that describe their interests. Other members first see only those hashtags. One member can send an interest request; chat becomes available only after the other member accepts.

The project implements a social network recommendation engine in **Python**. It represents members as graph nodes and accepted connections as edges. It recommends people using mutual connections and shared hashtags.

## What the application does

- Register and sign in with an email and password.
- Choose 3 to 8 interest hashtags and update them later.
- Discover people through hashtags without showing their name or email.
- Send, accept, or decline interest requests.
- Chat after a request is accepted. A generated alias appears at that stage; email remains private.
- Block a member or submit a report.

## Technology used

| Part | Technology |
| --- | --- |
| Website and dashboard (GUI) | React, Vite, Tailwind CSS |
| API and recommendation logic | Python, FastAPI |
| Database | MongoDB |
| Password and login security | bcrypt, signed session cookie |

The website is the graphical user interface (GUI). The Python API handles the application rules and talks to MongoDB.

## Run it after cloning

Install **Python 3.13 or newer**, **Node.js 20 or newer**, and **Git** first. Run the commands below from the project folder. The quick demo does **not** require Docker or a separate MongoDB installation. On its first run, it may download a MongoDB binary, so an internet connection is needed.

### Windows (Command Prompt)

```bat
git clone <your-repository-url>
cd <repository-folder>
py -3 -m venv .venv
.venv\Scripts\activate.bat
python -m pip install -r requirements-dev.txt
npm ci
npm run dev:demo
```

Use **Command Prompt** for these commands. After activation, the prompt should show `(.venv)`. If `py` is not found, install Python and select its launcher during installation.

### macOS or Linux

```sh
git clone <your-repository-url>
cd <repository-folder>
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
npm ci
npm run dev:demo
```

Open **http://localhost:5173** when the terminal says the demo has started. Press **Ctrl+C** to stop it. The demo database is temporary, so its data disappears when you stop the app.

For a quick demonstration, sign in with `demo1@example.test` and password `DemoPass123!`. Accounts `demo2@example.test` through `demo5@example.test` use the same password. You can also register a new account.

## Save data between runs (optional)

Install and start MongoDB locally, or use your own MongoDB connection URI. This option keeps accounts and messages after the app stops. Complete the setup above, then stop the demo with **Ctrl+C**.

On **Windows Command Prompt**:

```bat
copy .env.example .env
notepad .env
```

On **macOS or Linux**:

```sh
cp .env.example .env
```

Edit `.env`: set `MONGODB_URI` to your running MongoDB database and replace `JWT_SECRET` with a random value of at least 32 characters. On macOS or Linux, open `.env` in any text editor. The example URI uses a local MongoDB server and the `outside` database. To generate a secret, run `python -c "import secrets; print(secrets.token_urlsafe(48))"` and paste the result into `.env`. Do not upload `.env` to GitHub. The project already ignores it. Then start the app:

```sh
npm run dev
```

You can add the sample accounts to your saved database with `npm run seed`. Open **http://localhost:5173**. Start each new terminal session by activating `.venv` again before using `npm run dev`, `npm run seed`, or `npm test`.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev:demo` | Start the website, Python API, and temporary MongoDB |
| `npm run dev` | Start the website and Python API using `.env` |
| `npm run seed` | Add sample accounts to the configured database |
| `npm test` | Run Python tests |
| `npm run build` | Build the frontend |

## Main project files

- `client/src/App.jsx` — website pages and dashboard.
- `client/src/api.js` — browser requests to the Python API.
- `backend/app.py` — registration, discovery, requests, chat, blocking, and reporting.
- `backend/recommendations.py` — graph and hashtag recommendation logic.
- `backend/seed.py` — optional sample accounts.
- `backend/tests/` — Python tests.
- `.env.example` — example database and application settings.

## Viva questions and answers

**1. What is the aim of this project?**  To help people discover others through shared interests and connect at a pace they choose.

**2. Is the website a GUI?**  Yes. The React website is the graphical user interface. The dashboard, buttons, forms, and chat let users interact with the Python backend.

**3. What is the role of Python?**  Python runs the FastAPI server, applies privacy and connection rules, and calculates recommendations.

**4. Why did you use React and Vite?**  React builds the interactive pages. Vite runs the frontend during development and creates the production build.

**5. Why did you use MongoDB?**  MongoDB stores users, connection requests, messages, and reports as documents. Python accesses them through PyMongo.

**6. What is a graph in this project?**  Each user is a node. Each accepted connection is an undirected edge between two users.

**7. How are people recommended?**  The algorithm counts mutual connections and shared hashtags. Its score is `3 × mutual connections + shared hashtags`, so mutual connections have more weight.

**8. What happens when a new user has no connections?**  Shared hashtags can still produce useful recommendations. This helps with the cold start problem.

**9. Why use hashtags?**  They let members express interests while keeping personal details hidden during discovery.

**10. When can two users chat?**  Only after one sends an interest request and the other accepts it. The API checks the accepted connection before allowing messages.

**11. What information is private?**  Email is used for account access and is not shown to other members. Discovery shows hashtags; a generated alias appears after connection.

**12. How are passwords protected?**  The application stores a bcrypt hash of each password instead of the original password.

**13. How does login stay active?**  The server puts a signed session token in an HTTP-only cookie. Protected API routes check that token.

**14. How are duplicate interest requests prevented?**  A sorted key made from the two user IDs identifies each pair, and MongoDB has a unique index on that key.

**15. What happens when someone blocks another member?**  The API hides their connection from the blocked member and prevents further conversation access.

**16. Can users report someone?**  Yes. Reports are stored for review. This student project does not include an automated moderation system.

**17. How did you test the project?**  Python tests cover the recommendation logic and API permissions. The frontend can be checked with `npm run build`.

**18. What are the project's limits?**  It is a project demonstration, not a mental health treatment service. A production service would need moderation operations, deployment monitoring, and stronger abuse controls.

**19. What could be added later?**  Possible improvements include notifications, account recovery, accessibility testing, and an admin review panel for reports.
