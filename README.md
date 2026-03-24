# CS491-ChefAsap Installation Instructions

On VSCode terminal, Copy/Paste this command:
```
git clone https://github.com/rudrapatel28/CS491-ChefAsap.git
```

## Downloads Required

- Download **[Expo Go](https://expo.dev/client)** on your iOS or Android device to view the app on mobile
- Install **[Python](https://www.python.org/downloads/)** (verify with `python --version`)
- Install **[Node.js](https://nodejs.org/)** (verify with `node -v` and `npm -v`)

> MySQL Workbench is no longer required. The backend now uses Render Cloud PostgreSQL.

---

## Frontend

**Step 1:** Make sure you are in the `frontend` directory

**Step 2:** Run:
```
npm install
```

**Step 3:** Run one of the following:
```
npx expo start          # Local network (same WiFi only)
npx expo start --tunnel # Public access (anyone anywhere can scan QR)
```

> Use `--tunnel` if you want to share the app with people outside your local network.

---

## Backend

The backend is deployed to **Render Cloud** and runs 24/7 at:
```
https://chefasap-backend.onrender.com
```

The frontend automatically connects to this URL — **no local backend setup is required** to run the app.

### Running the Backend Locally (Optional — for backend development only)

If you need to make and test backend changes locally:

**Step 1:** Make sure you are in the `backend` directory

**Step 2:** Create and activate a virtual environment:
```
python -m venv venv
venv\Scripts\activate      # Windows
source venv/bin/activate   # Mac/Linux
```

**Step 3:** Install dependencies:
```
pip install -r requirements.txt
```

**Step 4:** Set environment variable:
- **Windows PowerShell:** `$env:DB_TYPE="postgresql"`
- **Windows CMD:** `set DB_TYPE=postgresql`
- **Mac/Linux:** `export DB_TYPE=postgresql`

**Step 5:** Run:
```
python app.py
```

> If testing with a local backend, update `frontend/config.js` to point to your local IP instead of the Render URL.

---

## Launching the App on Mobile

1. Download **Expo Go** from the [App Store (iOS)](https://apps.apple.com/app/expo-go/id982107779) or [Google Play (Android)](https://play.google.com/store/apps/details?id=host.exp.exponent)
2. In the `frontend` directory, run `npx expo start --tunnel`
3. Scan the QR code that appears in the terminal
4. The app will load on your device via Expo Go

> Both iOS and Android are supported.

---

## Quick Setup Reference

### To run the app (frontend only — backend is already live on Render):

```
1. cd frontend
2. npm install
3. npx expo start --tunnel
4. Scan QR code with Expo Go
```

That's it! No local backend needed.

---

## Architecture Overview

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

## Notes for Developers

- **Backend auto-deploys** on every push to `main` via Render
- **Frontend updates** are live immediately when Expo reloads
- The `frontend/config.js` file controls which backend URL is used
- Do not commit `.env` files — use Render's environment variable dashboard for secrets
- See `backend/README_SETUP.md` for detailed backend setup instructions
