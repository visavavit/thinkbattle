# Make navigation feel instant

## What's happening

The server itself is fast — `/browse` responds in about 45–50 ms. The problem is feedback: when you click "เลือกหัวข้อ" in the header, the router waits for the browse loader (feed + categories) to finish before it swaps the page. During that wait nothing on screen changes at all, so the click reads as dead even though the URL already changed.

## What to change

1. **Global navigation progress bar** — a thin blue/red brand-colored bar pinned under the header that appears whenever the router is loading or transitioning and slides away when the new page paints. Only shows after ~120 ms so fast, preloaded navigations don't flash it.

2. **Instant page swap with a skeleton** — give the router a default pending component so a route that takes longer than a moment shows its shell immediately instead of freezing on the old page. Browse gets a matching skeleton: heading, filter panel, and a grid of placeholder cards.

3. **Header link feedback** — the active/pressed nav link dims slightly the instant it's clicked so the click is visibly registered.

4. **Content enter animation** — new page content fades/slides in briefly (respecting reduced-motion) so the transition reads as movement rather than a jump.

5. **Wider preloading** — header links already preload on hover; extend preloading to touch/focus so mobile taps and keyboard users get the same head start.

## Technical notes

- `src/routes/__root.tsx`: add a `NavigationProgress` component driven by `useRouterState({ select: s => s.status === 'pending' || s.isLoading })`, rendered above `<Outlet />`; wrap the outlet in a keyed fade-in container.
- `src/router.tsx`: set `defaultPendingComponent`, `defaultPendingMs: 120`, `defaultPendingMinMs: 250`, and keep `defaultPreload: "intent"`.
- `src/routes/browse.tsx`: add a `pendingComponent` rendering a browse-shaped skeleton (reuse `arena-panel` styling, `Skeleton` from ui).
- No backend or query-logic changes; feed caching stays as is.
