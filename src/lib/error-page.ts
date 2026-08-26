import { th } from "./i18n/th";

/**
 * The last-resort 500 page, rendered when SSR itself has failed.
 *
 * Deliberately self-contained — inline CSS, no app bundle, no React — because
 * the thing that failed may be the bundle. The one import here is the Thai
 * dictionary, which is a plain object with no runtime dependencies of its own,
 * so it costs nothing and keeps this page from being the only surface on a
 * Thai-first site that speaks English.
 *
 * The server cannot know the reader's language: the preference lives in
 * `localStorage` and is applied after hydration (see `lib/i18n/index.tsx`).
 * So this renders the site default, Thai, with the English line beneath it for
 * anyone the default does not fit.
 */

const EN_TITLE = "This page didn't load";
const EN_BODY = "Something went wrong on our end. You can try refreshing or head back home.";

/** These strings are ours, not user input — escaped anyway so it stays true. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderErrorPage(): string {
  const title = escapeHtml(th["error.title"]);
  const body = escapeHtml(th["error.body"]);
  const retry = escapeHtml(th["common.tryAgain"]);
  const home = escapeHtml(th["common.goHome"]);

  return `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <style>
      body { font: 15px/1.6 "IBM Plex Sans Thai", system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #4b5563; margin: 0 0 1.5rem; }
      .alt { font-size: 0.8125rem; color: #6b7280; margin: 1.5rem 0 0; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #111; color: #fff; }
      .secondary { background: #fff; color: #111; border-color: #d1d5db; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${title}</h1>
      <p>${body}</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">${retry}</button>
        <a class="secondary" href="/">${home}</a>
      </div>
      <p class="alt" lang="en">${EN_TITLE}. ${EN_BODY}</p>
    </div>
  </body>
</html>`;
}
