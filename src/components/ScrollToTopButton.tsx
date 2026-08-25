import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

/**
 * A floating "back to top" button for the long feed and topic pages. It only
 * appears once the reader is far enough down that scrolling back by hand is a
 * chore — showing it near the top would just cover content for no gain.
 */
const SHOW_AFTER_PX = 600;

export function ScrollToTopButton() {
  const t = useT();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function scrollToTop() {
    // Honour the OS setting: smooth scrolling is nausea-inducing for some readers.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      onClick={scrollToTop}
      aria-label={t("common.scrollToTop")}
      title={t("common.scrollToTop")}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={`fixed right-4 bottom-4 z-30 h-11 w-11 rounded-full border border-border shadow-lg transition-opacity duration-200 sm:right-6 sm:bottom-6 ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <ArrowUp />
    </Button>
  );
}
