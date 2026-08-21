import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

export type LegalSection = { heading: string; body: string[] };
export type LegalContent = { title: string; updated: string; sections: LegalSection[] };

/**
 * Static policy pages are the one place where the shared dictionary is the
 * wrong tool: the copy is long-form and paragraph-shaped, so each page keeps
 * its Thai and English text side by side and this renders whichever is active.
 */
export function LegalPage({
  content,
  children,
}: {
  content: Record<"th" | "en", LegalContent>;
  children?: ReactNode;
}) {
  const { lang } = useI18n();
  const copy = content[lang] ?? content.th;

  return (
    <article className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-4xl">{copy.title}</h1>
        <p className="text-sm text-muted-foreground">{copy.updated}</p>
      </header>
      {copy.sections.map((section) => (
        <section key={section.heading} className="space-y-3">
          <h2 className="text-xl font-semibold">{section.heading}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph} className="text-sm leading-relaxed text-muted-foreground">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
      {children}
    </article>
  );
}
