# Chef Productivity Assistant LLM — Frontend Plan

## Context

This document covers the **frontend integration** of the Chef Productivity Assistant. The backend prompt-engineering work and API contracts are in the sibling [backend-plan.md](backend-plan.md).

The app is React Native + Expo (`expo-router`, NativeWind/Tailwind, `AuthContext` for tokens). There is already a chef-facing screen pattern in [frontend/app/ChefOrdersScreen.js](../../frontend/app/ChefOrdersScreen.js) that lists upcoming bookings — that screen is the natural entry point for this feature. Reuse the existing card/list UI vocabulary rather than rebuild it.

## 1. Goal

For every upcoming booking a chef sees on their orders screen, add a **Kitchen Assistant** action that opens a dedicated screen with four sections — **Prep List, Timeline, Substitutions, Plating** — each backed by one of the four LLM capabilities. The chef explicitly taps **Generate** to call the LLM (gives them control over cost and avoids burning credits on every tab switch).

## 2. Files to create / modify

| Path | Action |
|---|---|
| `frontend/app/ChefProductivityScreen.js` | **NEW** — main screen, accepts `?bookingId=` route param |
| `frontend/app/components/PrepListCard.js` | **NEW** — renders prep_list JSON grouped by `do_at` window |
| `frontend/app/components/TimelineCard.js` | **NEW** — vertical timeline anchored to `service_at` |
| `frontend/app/components/SubstitutionLookup.js` | **NEW** — small form: ingredient + reason → ranked swaps |
| `frontend/app/components/PlatingCard.js` | **NEW** — dish-by-dish plating notes + garnish chips |
| `frontend/app/ChefOrdersScreen.js` | **MODIFY** — add "Kitchen assistant" button on each upcoming booking |
| `frontend/app/_layout.js` | **MODIFY** — register `ChefProductivityScreen` in the root stack |
| `frontend/config.js` | No change (reuses `apiUrl`) |

Patterns to copy:
- Screen scaffold + auth: [frontend/app/ChefOrdersScreen.js](../../frontend/app/ChefOrdersScreen.js) (uses `useAuth()` for token, `getEnvVars()` for API URL).
- Card styling: [frontend/app/components/Card.js](../../frontend/app/components/Card.js), [frontend/app/components/SearchResultCard.js](../../frontend/app/components/SearchResultCard.js).
- Theming/dark mode: existing Tailwind classes (`bg-primary-100 dark:bg-dark-100`, etc.) — see `frontend/tailwind.config.js`.
- Lightweight in-screen tab/segment pattern: match the segment row used in `ProfileSettings.js`.

## 3. Screen layout

```
+------------------------------------------+
|  <- Kitchen Assistant — Booking #42      |  <- header bar
|  Sat May 15, 7:00 PM • 12 guests         |
+------------------------------------------+
| [Prep] [Timeline] [Subs] [Plating]       |  <- segmented tabs
+------------------------------------------+
|  PrepListCard                            |
|   T-24h                                  |
|     • Marinate jerk chicken (15m)        |
|     • Soak rice (5m)                     |
|   T-2h                                   |
|     • Dice scallions (10m)               |
|   T-30m                                  |
|     • Sear chicken                       |
|                                          |
|  [↻ Regenerate]                          |
+------------------------------------------+
```

Each tab maps 1:1 to one capability + one card component. The **Substitutions** tab is form-driven (no booking-scoped output): an input for the ingredient, a dropdown for the reason (out-of-stock / allergy / dietary), and a list of returned swaps.

Active vs. inactive tab pills use existing Tailwind classes:
```js
className={`px-4 py-2 rounded-full ${
  active
    ? 'bg-primary-200 dark:bg-dark-300'
    : 'bg-primary-100 dark:bg-dark-100'
}`}
```

## 4. State management

Local `useState` only (consistent with the rest of the app — no Redux/Context beyond `AuthContext`/`ThemeProvider`).

```js
const [tab, setTab]                = useState('prep');         // 'prep' | 'timeline' | 'subs' | 'plating'
const [data, setData]              = useState({});             // { prep:..., timeline:..., plating:... }
const [loadingTab, setLoadingTab]  = useState(null);
const [error, setError]            = useState(null);
```

On screen open, hydrate `data` once via `GET /sessions` (returns the latest persisted response per capability — avoids a second LLM call if the chef already generated something earlier). On tab switch, render from `data[tab]` if present; otherwise show the **Generate** button. Switching tabs is instant (in-memory).

## 5. API wiring

Reuse the raw-fetch pattern from other screens. One helper at the top of `ChefProductivityScreen.js`:

```js
async function callAssistant({ token, bookingId, capability, body }) {
  const { apiUrl } = getEnvVars();
  const path = capability === 'subs'
    ? '/api/v1/chef-productivity/substitutions'
    : `/api/v1/chef-productivity/booking/${bookingId}/${
        capability === 'prep' ? 'prep-list' : capability
      }`;
  const res = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Assistant request failed');
  return json;
}
```

Hydration on mount:
```js
const res = await fetch(`${apiUrl}/api/v1/chef-productivity/booking/${bookingId}/sessions`, {
  headers: { Authorization: `Bearer ${token}` },
});
// → seed `data` with the latest response per capability
```

## 6. Navigation

- Register the route in `frontend/app/_layout.js` alongside `ChefProfileScreen/[id]` and `ChefMenu/[id]`:
  ```js
  <Stack.Screen name="ChefProductivityScreen" options={{ headerShown: false }} />
  ```
- Entry point: in `ChefOrdersScreen.js`, on each upcoming booking row add a "Kitchen assistant" button:
  ```js
  router.push({ pathname: '/ChefProductivityScreen', params: { bookingId } })
  ```
- Only renders for `userType === 'chef'`; no public route.

## 7. Loading, empty, and error states

- **Loading per tab:** skeleton card (3 grey lines) while `loadingTab === tab`.
- **Empty:** "Tap Generate to ask the assistant" with a primary button — explicit user action so chefs control LLM cost.
- **Regenerate:** explicit `↻` button on each card; confirms before re-calling so accidental taps don't spend tokens.
- **Error:** inline red banner above the card with **Retry**; on 401, fall through to `useAuth().logout()`; on 403, show "This booking isn't yours."
- **Substitutions tab:** if the form fields are empty, the Generate button is disabled.

## 8. Styling

100% NativeWind classes from the existing palette in `frontend/tailwind.config.js` — no new colors. Tab pills use `bg-primary-200 dark:bg-dark-300` (active) and `bg-primary-100 dark:bg-dark-100` (inactive). Timeline left rail uses `border-l-2 border-primary-500`. Garnish chips on plating cards use `bg-primary-300 text-primary-500 rounded-full px-3 py-1`. Honor the active theme via `dark:` prefixes throughout.

## 9. Verification

1. `cd frontend && npm install` (no new deps required).
2. `npx expo start --web` → log in as a chef → tap an upcoming booking on `ChefOrdersScreen` → tap **Kitchen assistant**.
3. Confirm all four tabs render; tapping **Generate** on each calls the matching endpoint and shows the structured card.
4. Switch tabs back and forth — second visit shows cached data with no second network call.
5. Tap **Regenerate** on Prep List → confirm a new fetch and updated content.
6. Toggle dark mode in Profile → confirm the assistant screen restyles correctly.
7. Sign out and back in as a different chef → open the same `bookingId` directly via deep link → confirm 403 banner.
8. Background and resume the app → confirm in-memory `data` persists for the session and the screen reattaches above the keyboard.

## Critical files referenced

- `frontend/app/ChefOrdersScreen.js` — entry-point button location
- `frontend/app/_layout.js` — register the new screen here
- `frontend/app/context/AuthContext.js` — `useAuth()` for token + `userType`
- `frontend/app/components/Card.js`, `frontend/app/components/SearchResultCard.js` — card styling references
- `frontend/config.js` — `getEnvVars().apiUrl`
- `frontend/tailwind.config.js` — color palette
- `docs/menu-event-planner/frontend-plan.md` — sibling pattern this doc mirrors
