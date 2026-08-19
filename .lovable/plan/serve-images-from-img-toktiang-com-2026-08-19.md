# Serve images from img.toktiang.com

Goal: cover and avatar images load from your own domain instead of the temporary `pub-...r2.dev` address, with toktiang.com as the main site and www redirecting to the apex.

## What you do in Cloudflare (one time)

1. R2 bucket `debatearena` → Settings → Public access → Custom domains → Connect domain → `img.toktiang.com`.
2. Cloudflare adds the CNAME automatically if toktiang.com is on Cloudflare DNS. If the domain lives at another registrar, add the CNAME record Cloudflare shows you there.
3. Wait for the domain to show "Active" (SSL is issued automatically), then confirm an existing image opens at `https://img.toktiang.com/covers/<file>`.
4. Optional: keep the `r2.dev` public URL enabled until step 3 succeeds, then turn it off so images only serve from your domain.

## What I do in the app

1. Update the stored `R2_PUBLIC_BASE_URL` secret to `https://img.toktiang.com` so every new upload writes the new URL.
2. Run a one-off database update rewriting existing `topics.cover_image_url` (and any avatar URLs) from the `pub-...r2.dev` prefix to `https://img.toktiang.com`, leaving non-R2 URLs untouched.
3. Verify the homepage and a topic page render covers from the new domain with no broken images.

## Domain setup

- `toktiang.com` stays the primary domain on the project; `www.toktiang.com` redirects to it. Both are already connected — I'll confirm the primary flag is on the apex.

## Notes

- No CORS rule is needed: images are loaded as plain `<img>` sources, not fetched via JS.
- Uploads keep going through the server function with SigV4 signing, so bucket write access is unchanged — only the public read hostname changes.
- Files stay at the same keys, so the rewrite is a pure prefix swap and is reversible.
