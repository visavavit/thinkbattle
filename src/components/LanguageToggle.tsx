import { useI18n } from "@/lib/i18n";

/** TH / EN switch. The choice is stored per device. */
export function LanguageToggle() {
  const { lang, setLang, t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t("lang.switchToThai")}
      className="inline-flex overflow-hidden rounded-full border border-border text-xs font-semibold"
    >
      <button
        type="button"
        aria-pressed={lang === "th"}
        title={t("lang.switchToThai")}
        onClick={() => setLang("th")}
        className={`px-2 py-1 transition-colors ${
          lang === "th"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        TH
      </button>
      <button
        type="button"
        aria-pressed={lang === "en"}
        title={t("lang.switchToEnglish")}
        onClick={() => setLang("en")}
        className={`px-2 py-1 transition-colors ${
          lang === "en"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        EN
      </button>
    </div>
  );
}
