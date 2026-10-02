# FEASTIFY – Restaurant Management System

A complete restaurant website with customer accounts, real-time table booking,
visitor tracking and an admin dashboard with live analytics.

| Part      | Technology |
|-----------|------------|
| Frontend  | HTML5, CSS3, vanilla JavaScript, Bootstrap 5, Font Awesome, Chart.js |
| Backend   | Python, Flask, Flask-CORS, REST API, JWT in HttpOnly cookies, Werkzeug password hashing |
| Database  | MongoDB Atlas (database `feastify`) |

You run **one command** (`python app.py`) and open **http://127.0.0.1:5000**.
Flask serves both the website and the API, so there is nothing else to start.

---

## STEP 1 – Architecture and folder structure

```
Browser (HTML/CSS/JS)  ──fetch("/api/...")──►  Flask (backend/app.py)  ──pymongo──►  MongoDB Atlas
        ▲                                             │
        └────────── HTML pages + static files ◄───────┘
```

```
FEASTIFY/
├── .gitignore                  keeps .env and venv out of GitHub
├── README.md                   this guide
├── backend/
│   ├── app.py                  START HERE: creates the Flask app, serves the frontend
│   ├── config.py               reads settings from .env
│   ├── database.py             connects to MongoDB Atlas, creates indexes
│   ├── seed_admins.py          creates exactly the two admin accounts (hashed)
│   ├── test_connection.py      checks your MongoDB connection
│   ├── requirements.txt        Python packages
│   ├── .env                    YOUR secrets (never commit)
│   ├── .env.example            template for .env
│   ├── models/                 user_model.py, booking_model.py, visit_model.py
│   ├── routes/                 auth_routes.py, booking_routes.py, visit_routes.py,
│   │                           admin_routes.py, public_routes.py
│   └── utils/                  auth.py (JWT + decorators), validators.py,
│                               helpers.py, analytics.py
└── frontend/
    ├── index.html  about.html  menu.html  gallery.html  contact.html
    ├── booking.html  login.html  register.html  profile.html  my-bookings.html
    ├── admin-login.html  admin-dashboard.html  admin-bookings.html
    ├── admin-customers.html  admin-analytics.html
    └── static/
        ├── css/   style.css (customer site), admin.css (admin area)
        ├── js/    api.js (shared helpers), main.js, auth.js, booking.js,
        │          admin.js, analytics.js
        └── images/  put your own photos here (see images/README.txt)
```

**Which JavaScript file does what**

| File | Loaded on | Job |
|------|-----------|-----|
| `api.js` | every page | `FeastifyAPI.api()` fetch helper, formatting, toasts, image fallback |
| `main.js` | customer pages only | navbar/footer, shows customer name, logout, **visitor tracking**, menu, gallery, contact, profile |
| `auth.js` | login, register, admin-login | forms that call the auth APIs |
| `booking.js` | booking, my-bookings | live table availability, booking, history, cancel |
| `admin.js` | all admin pages | admin access check, sidebar, dashboard, bookings, customers |
| `analytics.js` | admin-analytics | all Chart.js charts |

Admin pages never load `main.js` – that is one of the two reasons admins are never counted as visitors.

---

## STEP 2 – Install the tools (one time)

1. **Python 3.10 or newer** – https://www.python.org/downloads/
   On Windows tick **“Add python.exe to PATH”** in the installer.
   Check in a terminal: `python --version` → `Python 3.12.x` (any 3.10+ is fine).
2. **VS Code** – https://code.visualstudio.com/ and install the **Python** extension (by Microsoft).
3. Unzip `FEASTIFY.zip` somewhere simple, e.g. `C:\Projects\FEASTIFY`.
4. In VS Code: **File → Open Folder… → FEASTIFY**. Open a terminal with **Terminal → New Terminal**.

---

## STEP 3 – Python virtual environment and packages

Run these in the VS Code terminal **one line at a time**.

**Windows (PowerShell / CMD)**
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

**macOS / Linux**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

What you should see:
- After `activate` your prompt starts with `(venv)`.
- `pip install` ends with `Successfully installed Flask-... pymongo-... PyJWT-...`.

If PowerShell says *“running scripts is disabled”*, run this once, then activate again:
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

> Every time you open VS Code later: `cd backend` then `venv\Scripts\activate` again.

---

## STEP 4 – MongoDB Atlas from zero

1. **Create an account** – go to https://www.mongodb.com/cloud/atlas/register and sign up (Google sign-in works).
2. **Create a cluster** – choose the **Free (M0)** option, any provider, a region close to you (e.g. Mumbai), name it `Feastify`, click **Create Deployment**.
3. **Create a database user** – Atlas shows a “Connect to Feastify” window, or go to **Security → Database Access → Add New Database User**.
   Username e.g. `feastify_user`, password e.g. `Feastify2026` (letters and numbers only is easiest). Role: **Read and write to any database**. Save it somewhere.
4. **Allow your IP** – **Security → Network Access → Add IP Address**. Click **Add Current IP Address**. For a college demo on different Wi-Fi networks you can use **Allow access from anywhere** (`0.0.0.0/0`) – fine for a project, not for real production.
5. **Get the connection string** – **Database → Connect → Drivers → Python**. Copy the string that looks like:
   `mongodb+srv://feastify_user:<db_password>@feastify.abc123.mongodb.net/?retryWrites=true&w=majority&appName=Feastify`
6. **Put it in `.env`** – open `backend/.env` and replace the `MONGO_URI=` line with your string, then replace `<db_password>` with the real password (remove the `< >`).
   If your password contains `@ : / ? # %`, either change it to a simple one or URL-encode it (`@` → `%40`).
   Leave `DB_NAME=feastify`. You do **not** need to create the database or collections by hand – MongoDB creates `users`, `admins`, `bookings`, `visits` and `messages` automatically, and the app creates the indexes on start.
7. **Test the connection**
   ```bash
   python test_connection.py
   ```
   Expected: `[OK] Connected. Database: feastify` followed by the list of collections.

`backend/.env` (already created for you – only change MONGO_URI):
```
MONGO_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/?retryWrites=true&w=majority&appName=Feastify
DB_NAME=feastify
SECRET_KEY=(a long random string – already generated)
JWT_EXPIRES_HOURS=24
APP_TIMEZONE=Asia/Kolkata
COOKIE_SECURE=false
PORT=5000
ADMIN1_USERNAME=admin1
ADMIN1_PASSWORD=Admin@123
ADMIN2_USERNAME=admin2
ADMIN2_PASSWORD=Admin@456
```
To make a new secret key: `python -c "import secrets; print(secrets.token_hex(32))"`

---

## STEP 5 – Create the two admin accounts

```bash
python seed_admins.py
```
Expected:
```
[ok] admin account ready: admin1
[ok] admin account ready: admin2
Total admin accounts in database: 2
```
The passwords are hashed with Werkzeug and stored in the `admins` collection. They never appear in any frontend file. Running the script again resets them to the values in `.env`, and removes any other admin record so there are always exactly two.

---

## STEP 6 – Run the project

```bash
python app.py
```
Expected:
```
========================================================
  FEASTIFY is running  ->  http://127.0.0.1:5000
  Admin login          ->  http://127.0.0.1:5000/admin-login.html
  Press CTRL+C to stop
========================================================
```
Open **http://127.0.0.1:5000** in Chrome/Edge. (CTRL+click the link in the terminal.)
Stop the server with **CTRL + C**.

> Do not open the HTML files by double-clicking them or with Live Server – they must come from Flask so the API and login cookies work.

---

## STEP 7 – API reference

All responses are JSON: `{ "success": true/false, "message": "...", ...data }`.

| Method | Endpoint | Who | Purpose |
|--------|----------|-----|---------|
| GET | `/api/health` | public | server + DB check |
| GET | `/api/tables` | public | 8 tables, seats, time slots |
| GET | `/api/tables/availability?date=YYYY-MM-DD&time=HH:MM&guests=N` | public | live free/booked tables |
| POST | `/api/contact` | public | contact form message |
| POST | `/api/auth/register` | public | create customer |
| POST | `/api/auth/login` | public | customer login (sets cookie) |
| GET | `/api/auth/me` | customer | logged-in customer (name, email…) |
| POST | `/api/auth/logout` | customer | clear cookie |
| PUT | `/api/auth/profile` | customer | update name/phone |
| PUT | `/api/auth/password` | customer | change password |
| POST | `/api/bookings` | customer | book a table (final availability check) |
| GET | `/api/bookings/my` | customer | only your own bookings |
| PUT | `/api/bookings/<id>/cancel` | customer | cancel your booking |
| POST | `/api/visits` | public | visitor/session ping (ignored for admins) |
| POST | `/api/admin/login` | public | admin login (separate cookie) |
| GET | `/api/admin/me` | admin | current admin |
| POST | `/api/admin/logout` | admin | clear admin cookie |
| GET | `/api/admin/bookings?status=&date=&q=` | admin | all bookings + counts |
| GET | `/api/admin/bookings/<id>` | admin | one booking |
| PUT | `/api/admin/bookings/<id>/status` | admin | Pending/Confirmed/Completed/Cancelled |
| GET | `/api/admin/customers?q=` | admin | customers with visits and bookings |
| GET | `/api/admin/visits` | admin | recent visitor sessions |
| GET | `/api/admin/messages` | admin | contact messages |
| GET | `/api/admin/analytics` | admin | every dashboard number and chart |

Try one in the browser: http://127.0.0.1:5000/api/health

**How the frontend calls the API** (from `api.js`):
```js
const data = await FeastifyAPI.api("/api/bookings", { method: "POST", body: { date, time, guests, table_number } });
```
The login cookie is sent automatically (`credentials: "same-origin"`).

---

## STEP 8 – How authentication works

- **Register/Login**: the password is hashed with `generate_password_hash` (Werkzeug) and checked with `check_password_hash`. Plain passwords are never stored.
- On success Flask creates a **JWT** (PyJWT, signed with `SECRET_KEY`) and puts it in an **HttpOnly cookie** (`feastify_token`). JavaScript cannot read it, which protects against token theft.
- Every customer page calls `GET /api/auth/me`. The **name comes from the database**, and `main.js` writes it into the navbar (“Hi, Name”), home (“Welcome, Name”), booking (“Booking for Name”), profile and “Name’s Bookings”.
- **Logout** deletes the cookie; the page then shows Login/Register again.
- **Admins** are a separate collection (`admins`) with a separate cookie (`feastify_admin_token`). Decorators in `utils/auth.py`:
  - `@customer_required` – customer APIs
  - `@admin_required` – every `/api/admin/*` API → customers get **401 “Unauthorized access”**
- **Admin pages are protected by Flask itself**: if you open `admin-dashboard.html` (or `/admin`, `/admin.html`) without a valid admin cookie, Flask never sends the page and redirects to `admin-login.html?error=unauthorized`, which shows *“Unauthorized access”*. `admin.js` checks again in the browser as a second layer.

---

## STEP 9 – How visitor tracking works

1. When someone opens any **customer** page, `main.js` looks for a visit id in the browser (`feastify_visit`). If none exists, or the last activity was more than **30 minutes** ago, it creates a new random id = **a new visit**.
2. It sends `POST /api/visits { session_id, page }`.
3. The backend:
   - **If a valid admin cookie is present, nothing is recorded** (admins are never visitors).
   - New `session_id` → inserts one document in `visits` (unique index on `session_id`, so double clicks cannot create duplicates).
   - Same `session_id` → only updates `last_seen`, `pages`, `page_views`. **Opening Home → About → Menu → Booking is still 1 visit.**
   - If a customer is logged in, the visit is linked to them once and their `users` record gets `visit_count + 1`, `first_visit`, `last_visit`.
4. Admin pages don't load `main.js` at all, so they never even send a ping.

`visits` document example:
```json
{ "session_id": "k3j2...", "user_id": "…", "visitor_name": "Muthumari", "visitor_email": "user@gmail.com",
  "visit_date": "2026-09-30T13:02:11Z", "last_seen": "2026-09-30T13:09:40Z", "is_admin": false,
  "pages": ["index", "menu", "booking"], "page_views": 5 }
```

---

## STEP 10 – Booking availability and duplicate prevention

- Tables: T1, T2 = 2 seats · T3, T4 = 4 · T5, T6 = 6 · T7, T8 = 8.
- Time slots: 12:00, 13:00, 14:00, 15:00, 18:00, 19:00, 20:00, 21:00, 22:00. Max 8 guests, up to 60 days ahead.
- The booking page asks `/api/tables/availability` every 15 seconds and shows each table as free, booked, or too small.
- When you press **Confirm booking**, the backend checks everything again (date, time, seats, past time, the table is free).
- **Race-proof**: the `bookings` collection has a **unique partial index** on `(table_number, date, time)` for active bookings (Pending/Confirmed). If two people press Book at the same moment, MongoDB accepts only one; the other gets HTTP 409 and the message **“Table 3 is already booked for this time.”**
- Cancelling a booking sets `active: false`, which frees the table immediately.
- One customer also cannot hold two active bookings at the same date and time.
- New bookings start as **Pending**; admin can Confirm, mark Completed, or Cancel.

---

## STEP 11 – Admin analytics

`GET /api/admin/analytics` runs MongoDB aggregation queries (`utils/analytics.py`) and returns:
- summary cards: total customers, total bookings, today's bookings, upcoming bookings, website visitors, active customers (visited in the last 7 days);
- visits: daily (7 days), weekly (8 weeks), monthly (6 months) – **admins excluded**;
- bookings: per day, per month, next 7 days, status split, table popularity, busiest time slots;
- customers: total customers growth, registrations per month and per day.

Dates are grouped in Indian time (`APP_TIMEZONE=Asia/Kolkata`). With an empty database all charts show zeros – they fill up as you use the site. Dashboard refreshes every 30 s, analytics every 60 s.

---

## STEP 12 – Testing checklist

Tip: use a **normal window** for the customer and an **Incognito window** for the admin, so the two logins don't mix.

| # | Test | How | Expected |
|---|------|-----|----------|
| 1 | Customer registration | register.html, fill the form | Account created, redirected, “Hi, Name” in navbar |
| 2 | Customer login | Logout, then login.html | Logged in, name shown |
| 3 | Customer logout | Navbar dropdown → Logout | Login/Register buttons return, name gone |
| 4 | Name on all pages | Visit Home, Booking, Profile, My Bookings | “Welcome, Name”, “Booking for Name”, “Name’s Bookings” |
| 5 | Customer booking | booking.html → date, time, guests, pick a table | Confirmation with booking ID `FST-xxxxxx`, status Pending |
| 6 | Duplicate prevention | Second customer (another browser) books the same table/date/time | “Table N is already booked for this time.” |
| 7 | Booking history | my-bookings.html | Only your bookings, tabs Upcoming/Past/Cancelled |
| 8 | Cancellation | Cancel an upcoming booking | Moves to Cancelled; table becomes free again |
| 9 | Admin login | Incognito → /admin-login.html → admin1 / Admin@123 | Dashboard opens |
| 10 | Admin dashboard | Check the 6 cards | Numbers match what you created |
| 11 | Admin customers | admin-customers.html | Your customers with Visits and Last Visit |
| 12 | Admin bookings | admin-bookings.html → confirm / complete / cancel / view | Status changes; customer sees it in My Bookings |
| 13 | Admin analytics | admin-analytics.html | Charts show real data |
| 14 | Visitor tracking | New Incognito window, open Home → Menu → About | Website Visitors +1 (not +3) |
| 15 | Admin not counted | While logged in as admin, open all admin pages and refresh | Website Visitors unchanged |
| 16 | Two admins | Logout, login as admin2 / Admin@456 | Works; any other username fails |
| 17 | Unauthorized access | As a customer (or logged out) open /admin.html or /admin-dashboard.html | Redirected to admin login with “Unauthorized access” |
| 18 | Mobile | Chrome DevTools (F12) → device toolbar → iPhone | Menu collapses, admin sidebar slides in |
| 19 | MongoDB storage | Atlas → Browse Collections → `feastify` | users, admins, bookings, visits contain data; passwords are hashes |
| 20 | Backend API | Open /api/health; open /api/admin/customers while logged out | `success: true`; second gives 401 “Unauthorized access” |

---

## Replacing images

Put your photos in `frontend/static/images/` with the names listed in `frontend/static/images/README.txt`
(`hero.jpg`, `restaurant.jpg`, `food1.jpg`–`food3.jpg`, `gallery1.jpg`–`gallery12.jpg`, …).
Until you do, every image automatically falls back to an online photo. The `404` lines for missing local images in the terminal are harmless.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `python` not found | Reinstall Python with “Add to PATH”, or use `py` instead of `python` |
| `ModuleNotFoundError: flask` | Activate the venv (`venv\Scripts\activate`) then `pip install -r requirements.txt` |
| `bad auth : authentication failed` | Wrong DB user/password in MONGO_URI; check Database Access |
| `ServerSelectionTimeoutError` / timeout | Add your IP in Network Access; check internet; some college Wi-Fi blocks port 27017 – try a mobile hotspot |
| `SSL: CERTIFICATE_VERIFY_FAILED` | `pip install --upgrade certifi` |
| Admin login says incorrect | Run `python seed_admins.py` again |
| Page looks unstyled | You opened the file directly; use http://127.0.0.1:5000 |
| Port 5000 in use | Change `PORT=5001` in `.env` and open http://127.0.0.1:5001 |
| Changes not showing | Press CTRL+F5 |

## Pushing to GitHub

`.gitignore` already excludes `backend/.env` and `venv/`. Commit `backend/.env.example` instead, so others know which settings to fill in.
