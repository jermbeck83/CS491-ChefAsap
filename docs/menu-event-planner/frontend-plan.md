# Menu & Event Planner LLM — Frontend Plan

## Context

This document covers the **frontend integration** of the Menu & Event Planner LLM feature. The backend prompt-engineering work and API contracts are in the sibling `backend-plan.md`.

The app is React Native + Expo (`expo-router`, NativeWind/Tailwind, `AuthContext` for tokens). There is already a strong chat-style UI pattern in `frontend/app/ChatScreen.js` that we will reuse rather than rebuild.

## 1. Goal

Add a chat-style **Menu & Event Planner** screen that lets customers describe an event in plain English and see streaming menu / ingredient / cost / chef recommendations. Reuse as much of the existing UI vocabulary (Tailwind palette, bubble shapes, auth flow) as possible.

## 2. Files to create / modify

| Path | Action |
|---|---|
| `frontend/app/MenuPlannerScreen.js` | **NEW** — main screen, chat-style |
| `frontend/app/components/PlanCard.js` | **NEW** — renders the §4.2 JSON nicely (collapsible sections per capability) |
| `frontend/app/components/ChefSuggestionCard.js` | **NEW** — chef row with match reason + "View profile" link |
| `frontend/app/(tabs)/SearchScreen.js` | **MODIFY** — add a "Plan an event with AI" call-to-action banner above results |
| `frontend/app/_layout.js` | **MODIFY** — register `MenuPlannerScreen` in the root stack |
| `frontend/config.js` | No change (reuses `apiUrl`) |

Patterns to copy:
- Chat scaffold: `frontend/app/ChatScreen.js` — header, FlatList of bubbles, input + send button (replace polling with single-request response, optionally streaming).
- Screen scaffold + auth: `frontend/app/(tabs)/SearchScreen.js` — `useAuth()` for token, `getEnvVars()` for API URL.
- Card styling: `frontend/app/components/Card.js` and `frontend/app/components/SearchResultCard.js`.
- Theming/dark mode: existing Tailwind classes (`bg-primary-100 dark:bg-dark-100`, etc.) — see `frontend/tailwind.config.js`.

## 3. Screen layout

```
+--------------------------------------+
|  <- Plan an Event with AI            |  <- header bar (matches ChatScreen)
+--------------------------------------+
|                                      |
|  [assistant bubble]                  |
|  "Hi! Tell me about your event..."   |
|                                      |
|  [user bubble]                       |
|  "Jamaican dinner for 12 next Sat"   |
|                                      |
|  [assistant: PlanCard]               |
|   +------------------------------+   |
|   | Menu (4 courses)            v|   |
|   | Ingredients (23 items)      >|   |
|   | Estimated cost: $576        >|   |
|   | Recommended chefs (3)       v|   |
|   |   - Marcus J. (4.8 stars)    |   |
|   |   - Tasha B. (4.7 stars)     |   |
|   |   [Book this plan]           |   |
|   +------------------------------+   |
|                                      |
+--------------------------------------+
|  [Tell me more about your event...] >|  <- input bar
+--------------------------------------+
```

Assistant bubble vs. user bubble use the same Tailwind classes already in `ChatScreen.js`:

```js
className={`max-w-3/4 p-3 rounded-3xl ${
  sentByUser
    ? 'bg-primary-200 dark:bg-dark-300 rounded-br-none'
    : 'bg-primary-300 dark:bg-dark-200 rounded-bl-none'
}`}
```

## 4. State management

Local `useState` only (consistent with the rest of the app — no Redux/Context beyond `AuthContext`/`ThemeProvider`).

```js
const [conversationId, setConversationId] = useState(null);  // UUID from first response
const [messages, setMessages]             = useState([]);    // [{role, content, plan?}]
const [input, setInput]                   = useState('');
const [sending, setSending]               = useState(false);
const [error, setError]                   = useState(null);
```

A message can be `{role:'assistant', plan: <JSON>}` for plan-card responses or `{role:'assistant', content: '...'}` for plain-text turns. `PlanCard` is rendered when `msg.plan` is set.

## 5. API wiring

Use the same raw-fetch pattern the rest of the app uses (no axios). Add one helper at the top of `MenuPlannerScreen.js`:

```js
async function postPlannerChat({ token, conversationId, message }) {
  const { apiUrl } = getEnvVars();
  const res = await fetch(`${apiUrl}/api/v1/menu-planner/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ conversation_id: conversationId, message }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Planner request failed');
  return data;  // { conversation_id, role, content, plan? }
}
```

`Book this plan` button calls `POST /api/v1/menu-planner/plan/<id>/book` and on success navigates to the existing booking confirmation flow.

## 6. Navigation

- Register the route in `frontend/app/_layout.js` alongside `ChefProfileScreen/[id]` and `ChefMenu/[id]`:
  ```js
  <Stack.Screen name="MenuPlannerScreen" options={{ headerShown: false }} />
  ```
- Entry point: a banner on `SearchScreen` ("Not sure what to cook? Plan with AI") that calls `router.push('/MenuPlannerScreen')`.
- Optional follow-up (out of scope for v1): replace one of the four customer tabs with the Planner once usage proves out.

## 7. Loading, empty, and error states

- **Sending:** show a typing-indicator bubble (3 animated dots) while `sending === true`.
- **Empty:** initial assistant bubble with a one-line greeting + 3 example prompt chips ("Italian dinner for 8", "Vegan brunch for 15", "Birthday surprise"). Tapping a chip pre-fills the input.
- **Error:** red toast at the bottom (reuse the toast pattern from `frontend/app/ChatScreen.js`) with a "Retry" button that re-sends the last message.
- **Auth expiry:** on 401, fall through to existing `logout()` from `useAuth()`.

## 8. Styling

100% NativeWind classes from the existing palette in `frontend/tailwind.config.js` — no new colors. Plan-card uses `bg-primary-100`, course headers `text-primary-500 font-bold`, dietary-conflict badges `bg-rating-empty text-primary-500`. Honor the active theme via `dark:` prefixes throughout.

## 9. Verification

1. `cd frontend && npm install` (no new deps required).
2. `npx expo start --web` → log in → tap the AI banner on Search → send `"Jamaican dinner for 12"` → confirm the PlanCard renders all four sections (menu, ingredients, cost, chefs).
3. Toggle dark mode in Profile → confirm the planner screen restyles correctly.
4. Background and resume the app → confirm conversation messages persist for the session (in-memory) and the input bar reattaches above the keyboard.
5. Tap `Book this plan` → confirm navigation to the existing booking flow with the chef pre-selected.

## Critical files referenced

- `frontend/app/ChatScreen.js` — chat UI pattern to copy
- `frontend/app/(tabs)/SearchScreen.js` — entry-point banner location
- `frontend/app/_layout.js` — register new screen here
- `frontend/app/context/AuthContext.js` — `useAuth()` for token
- `frontend/config.js` — `getEnvVars().apiUrl`
- `frontend/tailwind.config.js` — color palette
- `frontend/app/components/Card.js`, `frontend/app/components/SearchResultCard.js` — card styling references
