import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { en, type Dictionary, type TranslationKey } from "./en";
import { th } from "./th";
import { serverMessagesTh } from "./server-errors";

export type Lang = "th" | "en";

/** Thai-first: SSR and the first client render always use Thai. */
export const DEFAULT_LANG: Lang = "th";
const STORAGE_KEY = "vsarena.lang";

const DICTS: Record<Lang, Dictionary> = { th, en };

export type Vars = Record<string, string | number>;

function interpolate(template: string, vars?: Vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

/** Translate outside React (route head(), loaders). Defaults to Thai. */
export function translate(key: TranslationKey, vars?: Vars, lang: Lang = DEFAULT_LANG) {
  const dict = DICTS[lang] ?? th;
  return interpolate(dict[key] ?? en[key] ?? key, vars);
}

type Ctx = {
  lang: Lang;
  setLang: (next: Lang) => void;
  t: (key: TranslationKey, vars?: Vars) => string;
  /** Maps a server/database message to the active language. */
  tError: (message: string, fallback?: string) => string;
};

const LanguageContext = createContext<Ctx | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Never read storage during render: SSR output and hydration must match.
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "th") setLangState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode — the choice just won't persist */
    }
  }, []);

  const value = useMemo<Ctx>(() => {
    const t = (key: TranslationKey, vars?: Vars) => translate(key, vars, lang);
    return {
      lang,
      setLang,
      t,
      tError: (message: string, fallback?: string) => {
        if (lang !== "th") return message || fallback || "";
        const mapped = serverMessagesTh[message.trim()];
        return mapped ?? message ?? fallback ?? "";
      },
    };
  }, [lang, setLang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/**
 * Falls back to the default (Thai) dictionary instead of throwing when no
 * provider is above it. A duplicated module instance (HMR, or a component
 * rendered outside the app frame) must not blank the whole page.
 */
const FALLBACK_CTX: Ctx = {
  lang: DEFAULT_LANG,
  setLang: () => {},
  t: (key, vars) => translate(key, vars, DEFAULT_LANG),
  tError: (message, fallback) => serverMessagesTh[message?.trim()] ?? message ?? fallback ?? "",
};

export function useI18n() {
  return useContext(LanguageContext) ?? FALLBACK_CTX;
}

/** Shorthand for components that only need the translate function. */
export function useT() {
  return useI18n().t;
}

export type { TranslationKey };
