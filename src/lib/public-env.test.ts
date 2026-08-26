import { afterEach, describe, expect, test } from "bun:test";
import {
  PUBLIC_ENV_GLOBAL_KEY,
  publicEnvBootstrapScript,
  readInjectedPublicEnv,
} from "./public-env";

const globals = globalThis as Record<string, unknown>;

function withEnv(vars: Record<string, string | undefined>, run: () => void) {
  const previous = new Map(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    run();
  } finally {
    for (const [k, v] of previous) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

afterEach(() => {
  delete globals[PUBLIC_ENV_GLOBAL_KEY];
});

describe("readInjectedPublicEnv", () => {
  test("returns an empty object when nothing was injected", () => {
    expect(readInjectedPublicEnv()).toEqual({});
  });

  test("reads what the bootstrap script parked on the global", () => {
    globals[PUBLIC_ENV_GLOBAL_KEY] = { SUPABASE_URL: "https://x.supabase.co" };
    expect(readInjectedPublicEnv().SUPABASE_URL).toBe("https://x.supabase.co");
  });
});

describe("publicEnvBootstrapScript", () => {
  test("serialises the server variables", () => {
    withEnv(
      { SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc" },
      () => {
        expect(publicEnvBootstrapScript()).toBe(
          `window.${PUBLIC_ENV_GLOBAL_KEY}={"SUPABASE_URL":"https://x.supabase.co","SUPABASE_PUBLISHABLE_KEY":"sb_publishable_abc"}`,
        );
      },
    );
  });

  test("is empty when there is nothing to hand over", () => {
    withEnv({ SUPABASE_URL: undefined, SUPABASE_PUBLISHABLE_KEY: undefined }, () => {
      expect(publicEnvBootstrapScript()).toBe("");
    });
  });

  // The server renders this string into the document; the client renders it
  // again during hydration from the values the script itself set. A mismatch
  // is a hydration error on every page, so the two must agree exactly.
  test("the client reproduces the server's markup from the injected global", () => {
    let serverRendered = "";
    withEnv(
      { SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc" },
      () => {
        serverRendered = publicEnvBootstrapScript();
      },
    );

    // The browser has no server variables, only the global the script set.
    globals[PUBLIC_ENV_GLOBAL_KEY] = {
      SUPABASE_URL: "https://x.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc",
    };
    withEnv({ SUPABASE_URL: undefined, SUPABASE_PUBLISHABLE_KEY: undefined }, () => {
      expect(publicEnvBootstrapScript()).toBe(serverRendered);
    });
  });

  test("cannot break out of the script element", () => {
    withEnv(
      {
        SUPABASE_URL: "https://x/</script><script>alert(1)</script>",
        SUPABASE_PUBLISHABLE_KEY: "k",
      },
      () => {
        const script = publicEnvBootstrapScript();
        expect(script).not.toContain("</script");
        expect(script).toContain("<\\/script");
      },
    );
  });

  test("cannot open an HTML comment", () => {
    withEnv({ SUPABASE_URL: "https://x/<!--", SUPABASE_PUBLISHABLE_KEY: "k" }, () => {
      expect(publicEnvBootstrapScript()).not.toContain("<!--");
    });
  });
});
