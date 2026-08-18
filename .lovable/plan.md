# Thai UI (Thai default, English toggle)

Make the site Thai-first: all public-facing text in formal news-style Thai, with a language switcher so English stays available. Admin/curator dashboard stays in English.

## What changes for users

- The site opens in Thai by default (feed, topic pages, voting, comments, replies, auth, suggest-topic dialog, headliner carousel, error and empty states, toasts).
- A small TH / EN switch in the header. The choice is remembered on the device and persists across pages and reloads.
- Thai copy uses a neutral editorial newsroom tone (no slang), matching the news-site look.
- Thai number/date formatting: "2 ชั่วโมงที่แล้ว", "1,240 โหวต".
- Thai body/heading fonts are already loaded (IBM Plex Sans Thai / Noto Serif Thai) — line-height and spacing get a pass so Thai text with tone marks doesn't clip.

## What stays the same

- Topic titles, choice labels, tags, and comments stay exactly as authors wrote them — no auto-translation of user content.
- Admin dashboard (topics, audience/bot campaigns, moderation, users) stays English.

## Technical approach

- Add a lightweight in-app i18n layer (no new heavy dependency): `src/lib/i18n/th.ts` and `en.ts` dictionaries plus a `LanguageProvider` + `useT()` hook mounted in `src/routes/__root.tsx`.
- Language resolution order: saved preference in `localStorage` → default `th`. Read after hydration via a hydration-safe hook so SSR output and first client render agree (SSR renders `th`, the default).
- Set `<html lang>` accordingly through the root route.
- Replace hardcoded strings with `t('key')` in: `src/routes/index.tsx`, `browse.tsx`, `topic.$id.tsx`, `auth.tsx`, `src/components/SiteHeader.tsx`, `Discussion.tsx`, `TopicCardItem.tsx`, `SplitBar.tsx`, `SuggestTopicDialog.tsx`, `TagInput.tsx`, `ImageUploadButton.tsx`.
- Filter tab keys stay English in the URL (`?tab=trending`); only labels are translated.
- Route `head()` titles/descriptions get Thai defaults (keeps SEO aligned with the Thai audience), with `og:locale` set to `th_TH`.
- Server-thrown messages (spam guards, rate limits, upload validation) are mapped to Thai in the client via an error-code/message lookup so toasts read naturally; no database changes required.
- Add a `TH/EN` toggle button component in the header using existing shadcn button styling.

## Out of scope for this pass

- Translating admin panel strings.
- Translating stored data or bot-generated comments.
