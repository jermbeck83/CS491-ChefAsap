# ChefAsap — CS491

A React Native + Expo app for booking personal chefs. Customers discover nearby chefs, browse menus, place bookings, and chat. Chefs manage orders, use an AI Kitchen Assistant, and sync their calendar.

---

## Installation

On VSCode terminal:

```bash
git clone https://github.com/rudrapatel28/CS491-ChefAsap.git
```

### Downloads Required
- **Expo Go** on your iOS or Android device
- **Python** (verify with `python --version`)
- **Node.js** (verify with `node -v` and `npm -v`)

> MySQL Workbench is no longer required. The backend uses Render Cloud PostgreSQL.

---

## Frontend

```bash
cd frontend
npm install
npx expo start          # Local network (same WiFi only)
npx expo start --tunnel # Public access (anyone anywhere can scan QR)
```

Use `--tunnel` to share the app with people outside your local network.

---

## Backend

The backend is deployed to Render Cloud and runs 24/7 at:

**https://chefasap-backend.onrender.com**

The frontend automatically connects to this URL — no local backend setup is required.

### Running the Backend Locally (Optional)

Only needed if you are making backend changes:

```bash
cd backend
python -m venv venv
venv\Scripts\activate      # Windows
source venv/bin/activate   # Mac/Linux
pip install -r requirements.txt
```

Set the environment variable:
```bash
# Windows PowerShell
$env:DB_TYPE="postgresql"
# Windows CMD
set DB_TYPE=postgresql
# Mac/Linux
export DB_TYPE=postgresql
```

Then run:
```bash
python app.py
```

If testing locally, update `frontend/config.js` to point to your local IP instead of the Render URL.

---

## Launching the App on Mobile

1. Download **Expo Go** from the App Store (iOS) or Google Play (Android)
2. In the `frontend` directory, run `npx expo start --tunnel`
3. Scan the QR code in the terminal
4. The app loads on your device via Expo Go

Both iOS and Android are supported.

---

## Quick Setup (Frontend Only)

```bash
cd frontend
npm install
npx expo start --tunnel
# Scan QR code with Expo Go
```

No local backend needed — it's already live on Render.

---

## Architecture

```
Mobile Device (Expo Go)
        ↓  scans QR
Expo Tunnel (public URL)
        ↓
Your PC (Metro Bundler — frontend only)
        ↓  API calls
Render Web Service (Flask — always online)
        ↓
Render PostgreSQL (Database — always online)
```

---

## Features

### Customer
- **Search** — find nearby chefs by name, cuisine, or event type with radius, meal timing, and gender filters
- **AI Event Planner** — chat-based menu planner that suggests full menus, ingredients, estimated cost, and matching chefs ("Plan an event with AI" banner on Search)
- **Chef Profiles & Menus** — browse chef profiles, view menus organized by meal type (Breakfast / Lunch / Dinner / Specialties), add items to cart
- **Booking Modal** — select date/time with steppers, event ZIP, payment method (Stripe), and dynamic surge pricing
- **My Bookings** — filter by All / Pending / Accepted / Completed / Declined with count badges; leave reviews on completed bookings
- **Messages** — chat with chefs; filter by All / Unread / Chefs / Bookings
- **Payments** — Stripe card management in Profile; cards saved and reused across bookings

### Chef
- **My Bookings (Orders)** — filter by All / Pending / Accepted / Completed / Declined with count badges; Accept, Decline, or Mark Complete
- **Kitchen Assistant** — AI-powered productivity tool with 4 tabs:
  - **Prep** — auto-generated prep list grouped by time window
  - **Timeline** — step-by-step service timeline
  - **Subs** — ingredient substitution lookup with reason selector
  - **Plating** — plating instructions and garnish suggestions
- **Calendar Sync** — Google Calendar integration and `.ics` file import
- **Messages** — chat with customers

### Shared
- **Real-time messaging** — polling-based chat with read receipts
- **Push notifications** — unread message badge on Messages tab
- **Recent & Favorite Chefs** — surfaced on Search screen
- **Meal-time conflict detection** — warns when cart items don't match selected booking time

---

## Recent Changes (May 2026)

### Bug Fixes
- **Booking status filtering** — fixed chef and customer booking screens showing wrong status under filter tabs; statuses are now normalized on load (handles `"Declined"` vs `"declined"`, `"confirmed"` → `"accepted"`, etc.) and filtered client-side
- **Duplicate bookings** — deduplicated dashboard API response that could return the same booking in multiple buckets

### iOS UI Fixes
- Removed double safe area padding on **Messages**, **ChatScreen**, **MenuPlannerScreen**, and **Kitchen Assistant** — all screens were applying `paddingTop: insets.top` on top of the `SafeAreaView` already set in `_layout.js`
- Fixed **search button clipping** — moved `padding` from `ScrollView style` to `contentContainerStyle` on Search screen; replaced the `Input` component in SearchBar with a plain `TextInput` to prevent overflow

### Android UI Fixes
- Fixed **Search Radius stepper** being clipped on Android — replaced the `Stepper` component with an inline `−  10 mi  +` control using `StyleSheet`; added `flex: 1` to filter cells so Meal Timing and Chef Gender split evenly

### Booking Modal
- Fixed **date/time stepper overlap** — reduced button size (`36px` → `28px`), tightened gap and divider margins so Month / Day / Year fit in one row without clipping

### New Features
- **AI Menu & Event Planner** (`MenuPlannerScreen`) — chat UI with greeting, example prompt chips, typing indicator, error toast with retry; `PlanCard` renders collapsible sections for menu courses, ingredients, estimated cost, and chef suggestions; `ChefSuggestionCard` shows rating, cuisine, distance, match reason, and View Profile link
- **Filter count badges** — Pending `(3)`, Declined `(1)`, etc. on both chef and customer booking screens
- **Declined/Cancelled status messages** — inline card messages for declined and cancelled bookings on customer side

---

## Developer Notes

- Backend **auto-deploys** on every push to `main` via Render
- Frontend updates are **live immediately** when Expo reloads
- `frontend/config.js` controls which backend URL is used
- **Do not commit `.env` files** — use Render's environment variable dashboard for secrets
- See `backend/README_SETUP.md` for detailed backend setup

### Key Files

| File | Purpose |
|------|---------|
| `frontend/app/(tabs)/SearchScreen.js` | Search tab with AI planner banner |
| `frontend/app/components/SearchBar.js` | Search bar with filters and radius stepper |
| `frontend/app/MenuPlannerScreen.js` | AI Event Planner chat screen |
| `frontend/app/components/PlanCard.js` | Collapsible plan sections (menu/ingredients/cost/chefs) |
| `frontend/app/components/ChefSuggestionCard.js` | Chef suggestion row in planner |
| `frontend/app/CustomerBookingsScreen.js` | Customer bookings list with status filter |
| `frontend/app/ChefOrdersScreen.js` | Chef orders list with status filter |
| `frontend/app/ChefProductivityScreen.js` | Kitchen Assistant (4 tabs) |
| `frontend/app/ChefMenu/[id].js` | Chef menu + booking modal |
| `frontend/app/(tabs)/Messages.js` | Messages list |
| `frontend/app/ChatScreen.js` | Individual chat |
| `frontend/app/_layout.js` | Root stack navigator |
| `frontend/config.js` | Backend URL config |
| `backend/blueprints/` | Flask API blueprints |

### Test Accounts
- **Chef:** mr.golem420@gmail.com (users.id=6, chefs.id=3)
- **Customer:** MS GOLEM (users.id=4, customers.id=3)
- **Test booking:** booking_id=24
