# Recommendation Engine — Frontend Plan

## Context

This document covers the **frontend integration** of the Recommendation Engine. The backend (CF + embedding model, three GET endpoints) is in the sibling `backend-plan.md`.

The app is React Native + Expo (`expo-router`, NativeWind/Tailwind, `AuthContext` for tokens). It already has well-styled chef cards (`SearchResultCard`) and a horizontal-scroll wrapper (`Card` with `scrollDirection="horizontal"`). We reuse both rather than build new card UI.

## 1. Goal

Surface three recommendation rails across the customer experience without disrupting existing flows:

1. **"Recommended for you"** — personalized rail at the top of `SearchScreen`.
2. **"Popular menus near you"** — geo-rail also on `SearchScreen`.
3. **"Similar chefs"** — at the bottom of `ChefProfileScreen`, after the user has read the profile.

Each rail is a horizontal carousel of chef cards. Tapping a card navigates to `ChefProfileScreen/[id]`.

## 2. Files to create / modify

| Path | Action |
|---|---|
| `frontend/app/components/RecommendationRail.js` | **NEW** — reusable rail: title + horizontal `Card` of chef tiles |
| `frontend/app/components/PopularMenuCard.js` | **NEW** — compact card for menu items (dish name, chef, price, cuisine badge) |
| `frontend/app/(tabs)/SearchScreen.js` | **MODIFY** — add "Recommended for you" + "Popular menus near you" rails above search results |
| `frontend/app/ChefProfileScreen/[id].js` | **MODIFY** — add "Similar chefs" rail at bottom of the screen |
| `frontend/config.js` | No change (reuses `apiUrl`) |

Patterns to copy:
- Horizontal scroll wrapper: `frontend/app/components/Card.js` with `isScrollable` + `scrollDirection="horizontal"` (already used in `SearchScreen` for "Favorite Chefs" / "Recently viewed").
- Chef tile: `frontend/app/components/SearchResultCard.js`.
- API + auth: `useAuth()` from `frontend/app/context/AuthContext.js`, `getEnvVars()` from `frontend/config.js`.
- Navigation: `router.push('/ChefProfileScreen/' + id)` — same as `SearchScreen` line ~289.
- Theming/dark mode: existing Tailwind classes (`bg-primary-100 dark:bg-dark-100`, etc.) — see `frontend/tailwind.config.js`.

## 3. `RecommendationRail.js` design

A single component that handles all three use cases via props.

```js
<RecommendationRail
  title="Recommended for you"
  endpoint="/api/v1/recommendations/for-you"
  params={{ limit: 10 }}
  cardType="chef"
/>

<RecommendationRail
  title="Popular menus near you"
  endpoint="/api/v1/recommendations/popular-menus"
  params={{ lat: userLat, lng: userLng, radius: 15, limit: 10 }}
  cardType="menu"
/>

<RecommendationRail
  title="Similar chefs"
  endpoint={`/api/v1/recommendations/similar-chefs/${chefId}`}
  params={{ limit: 10 }}
  cardType="chef"
/>
```

Internally:

```js
const { token } = useAuth();
const { apiUrl } = getEnvVars();
const [items, setItems] = useState([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  const qs = new URLSearchParams(params).toString();
  fetch(`${apiUrl}${endpoint}?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((r) => r.json())
    .then((d) => setItems(d.recommendations || []))
    .catch(() => setItems([]))
    .finally(() => setLoading(false));
}, [endpoint, JSON.stringify(params)]);

if (loading) return <LoadingIcon />;
if (items.length === 0) return null;            // hide rail entirely on empty

return (
  <Card title={title} isScrollable scrollDirection="horizontal">
    {items.map((it) => cardType === 'chef'
      ? <SearchResultCard chef={it} key={it.chef_id} compact />
      : <PopularMenuCard item={it} key={it.id} />
    )}
  </Card>
);
```

## 4. Screen layout

### SearchScreen (top of customer search)

```
+------------------------------------------+
|  Search bar                              |
+------------------------------------------+
|  Recommended for you            (rail)   |
|  [chef] [chef] [chef] [chef] ...  ->     |
+------------------------------------------+
|  Popular menus near you         (rail)   |
|  [menu] [menu] [menu] [menu] ...  ->     |
+------------------------------------------+
|  Favorite Chefs                 (rail)   |  <- existing
|  Recently viewed                (rail)   |  <- existing
+------------------------------------------+
|  Search results (vertical list)          |
+------------------------------------------+
```

### ChefProfileScreen (bottom)

```
+------------------------------------------+
|  ...existing chef profile...             |
|  Featured dishes                         |
|  About this chef                         |
|  [View Menu] button                      |
+------------------------------------------+
|  Similar chefs                  (rail)   |  <- NEW (last section)
|  [chef] [chef] [chef] [chef] ...  ->     |
+------------------------------------------+
```

## 5. State management

Per-rail local `useState` (no global store — consistent with the rest of the app).

```js
const [items, setItems]   = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError]   = useState(null);
```

`SearchScreen` needs the user's lat/lng for the popular-menus rail. Reuse the same location source already used by the existing nearby-chef search (`getEnvVars()` callsite or whatever hook supplies coords today — confirmed in `SearchScreen.js`). If location is unavailable, render the chef rail and skip the menu rail.

## 6. API wiring

Standard raw-fetch pattern. The rail does its own fetch (encapsulated). One concrete contract:

```js
GET /api/v1/recommendations/for-you?limit=10
→ { use_case: "for_you", recommendations: [{ chef_id, first_name, last_name,
       photo_url, cuisines: [...], avg_rating, base_rate_per_person,
       score, reason_code }, ...] }

GET /api/v1/recommendations/similar-chefs/12?limit=10
→ same shape

GET /api/v1/recommendations/popular-menus?lat=40.74&lng=-74.18&radius=15&limit=10
→ { use_case: "popular_menus", recommendations: [{ id, dish_name, cuisine_type,
       price, chef: { chef_id, first_name, last_name, photo_url, avg_rating } }] }
```

Tap target: chef card → `router.push(`/ChefProfileScreen/${chef_id}`)`. Menu card → same destination scoped to the dish's chef (`router.push(`/ChefProfileScreen/${item.chef.chef_id}`)`).

## 7. Loading, empty, and error states

- **Loading:** `LoadingIcon` (`frontend/app/components/LoadingIcon.js`) inline at the rail's vertical position. Don't block the rest of the screen.
- **Empty:** hide the rail entirely (return `null`). Empty rails are visual noise.
- **Error:** silently hide the rail and log to console. Recommendations are non-essential — never block the user with a recommendation error.
- **Auth expiry:** on 401, fall through to existing `logout()` from `useAuth()` (matches behavior elsewhere).

## 8. Styling

100% NativeWind classes from the existing palette in `frontend/tailwind.config.js` — no new colors. The rail title uses the same heading classes as the existing "Favorite Chefs" rail (`text-lg font-semibold text-primary-500 dark:text-dark-50`). `PopularMenuCard` mimics `SearchResultCard` dimensions so all rails align visually. Honor the active theme via `dark:` prefixes throughout.

A small "★ Recommended" badge (or "Similar" / "Popular") at the top-right of each card uses the rail's `cardType` to label why the user is seeing it — improves trust without explaining ML internals.

## 9. Verification

1. `cd frontend && npm install` (no new deps required).
2. `npx expo start --web` → log in as a customer with booking history → open Search.
3. Confirm two new rails render above the existing favorites rail. Tap a chef card → navigates to `ChefProfileScreen/[id]`.
4. Open any chef profile → scroll to bottom → confirm "Similar chefs" rail renders with at least 5 chefs.
5. Toggle dark mode in Profile → confirm rails restyle correctly.
6. Cold-start check: log in as a fresh customer (no bookings) → "Recommended for you" still populates (cold-start fallback path on the backend).
7. Empty-state check: hit a chef profile in a region with very few chefs → confirm the rail self-hides instead of showing an empty section.
8. Network check: throttle the network → confirm `LoadingIcon` shows while the fetch is in flight and the rest of the screen remains interactive.

## Critical files referenced

- `frontend/app/(tabs)/SearchScreen.js` — host for "Recommended for you" + "Popular menus near you"; existing rails to mirror
- `frontend/app/ChefProfileScreen/[id].js` — host for "Similar chefs"
- `frontend/app/components/Card.js` — horizontal scroll wrapper (`isScrollable`, `scrollDirection="horizontal"`)
- `frontend/app/components/SearchResultCard.js` — chef card to reuse
- `frontend/app/components/LoadingIcon.js` — loading state
- `frontend/app/context/AuthContext.js` — `useAuth()` for token
- `frontend/config.js` — `getEnvVars().apiUrl`
- `frontend/tailwind.config.js` — color palette
