import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * A thin brand-coloured bar under the header that shows while the router is
 * resolving a navigation. Navigations that finish quickly (preloaded links)
 * never show it: the bar only appears once the wait passes SHOW_AFTER_MS.
 */
const SHOW_AFTER_MS = 120;
const MIN_VISIBLE_MS = 300;

export function NavigationProgress() {
  const isNavigating = useRouterState({
    select: (s) => s.status === "pending" || s.isLoading || s.isTransitioning,
  });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isNavigating) {
      const timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
      return () => clearTimeout(timer);
    }
    if (!visible) return;
    // Keep it on screen long enough to be read as motion, not a flicker.
    const timer = setTimeout(() => setVisible(false), MIN_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [isNavigating, visible]);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed top-0 left-0 z-50 h-0.5 w-full overflow-hidden transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="nav-progress-bar h-full w-full" />
    </div>
  );
}
