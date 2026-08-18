import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";

const MAX_TAGS = 6;
const MAX_LEN = 24;

function normalize(raw: string) {
  return raw.replace(/[#,]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_LEN);
}

/** Free-text tag entry — commit with comma, space or Enter. */
export function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const inputPlaceholder = placeholder ?? t("tags.placeholder");

  function commit(raw: string) {
    const tag = normalize(raw);
    if (!tag) return;
    if (value.length >= MAX_TAGS) return;
    if (value.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    onChange([...value, tag]);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === " " || e.key === "Tab") {
      if (!draft.trim()) return;
      e.preventDefault();
      commit(draft);
      setDraft("");
      return;
    }
    if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="mt-1 space-y-2">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-1 text-xs"
            >
              #{tag}
              <button
                type="button"
                aria-label={t("tags.remove", { tag })}
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <Input
        value={draft}
        maxLength={MAX_LEN}
        placeholder={value.length >= MAX_TAGS ? t("tags.max", { n: MAX_TAGS }) : inputPlaceholder}
        disabled={value.length >= MAX_TAGS}
        onChange={(e) => setDraft(e.target.value.replace(/[,]/g, ""))}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (draft.trim()) {
            commit(draft);
            setDraft("");
          }
        }}
      />
      <p className="text-xs text-muted-foreground">{t("tags.hint", { n: MAX_TAGS })}</p>
    </div>
  );
}
