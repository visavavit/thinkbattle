import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";
import { PageSkeleton } from "./components/RouteSkeletons";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Retry transient network failures (dev reloads, flaky connections)
        // instead of throwing the user into an error screen.
        retry: 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
        refetchOnWindowFocus: false,
        // Data rendered on the server stays trusted for a moment after
        // hydration, so the first paint does not immediately refetch
        // everything it just received.
        staleTime: 30_000,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Nothing on screen changes while a route's loader runs, so a click on a
    // topic reads as a dead link until the server answers. Starting the load on
    // hover or touchstart usually has the data ready by the time the click
    // lands. defaultPreloadStaleTime below keeps a hovered route from being
    // fetched again on every pass.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 30_000,
    // If a loader takes longer than a blink, swap in the route's skeleton so
    // the click is visibly acknowledged instead of freezing the old page.
    defaultPendingComponent: PageSkeleton,
    defaultPendingMs: 120,
    defaultPendingMinMs: 250,
  });

  // Ships the server's query cache to the browser with the HTML. Without it
  // every loader query runs twice — once during SSR, once again on hydration —
  // which both slows the first paint and makes the two renders disagree.
  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
};
