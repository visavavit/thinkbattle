import { ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

export function ScrollToTopButton() {
  const t = useT();

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
      className="fixed right-4 bottom-4 z-50 h-11 w-11 rounded-full border border-border opacity-100 shadow-lg sm:right-6 sm:bottom-6"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <ArrowUp />
    </Button>
  );
}
