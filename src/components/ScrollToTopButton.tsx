import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

/**
 * A floating "back to top" button for the long feed and topic pages. It only
 * appears once the reader is far enough down that scrolling back by hand is a
 * chore — showing it near the top would just cover content for no gain.
 */
const SHOW_AFTER_PX = 320;

export function ScrollToTopButton() {
  const t = useT();
  const [visible, setVisible] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    const updateVisibility = () => {
      const scrollTop = Math.max(
        window.scrollY,
        document.documentElement.scrollTop,
        document.body.scrollTop,
      );
      setVisible(scrollTop >= SHOW_AFTER_PX);
    };

    updateVisibility();
    const restoreCheck = window.setTimeout(updateVisibility, 100);
    window.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility, { passive: true });
    window.addEventListener("pageshow", updateVisibility);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      window.clearTimeout(restoreCheck);
      window.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
      window.removeEventListener("pageshow", updateVisibility);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, [pathname]);

  function scrollToTop() {
    // Honour the OS setting: smooth scrolling is nausea-inducing for some readers.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }

  if (!visible) return null;

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      onClick={scrollToTop}
      aria-label={t("common.scrollToTop")}
      title={t("common.scrollToTop")}
      className="fixed right-4 bottom-4 z-50 h-11 w-11 animate-in rounded-full border border-border shadow-lg fade-in duration-200 sm:right-6 sm:bottom-6"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <ArrowUp />
    </Button>
  );
}
