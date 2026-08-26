// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Only VITE_-prefixed variables reach the browser bundle. A deploy environment
// that sets just the unprefixed server names would otherwise build a client
// with no Supabase credentials, so mirror them here before the shared config
// collects the VITE_ values. Explicit VITE_ values still win.
//
// This only helps when the build sees those variables. When it does not, the
// server injects them into the document at runtime instead — src/lib/public-env.ts.
for (const name of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PROJECT_ID"]) {
  const value = process.env[name];
  if (value && !process.env[`VITE_${name}`]) process.env[`VITE_${name}`] = value;
}

// The shared config injects VITE_* values into browser bundles at build time.
export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
