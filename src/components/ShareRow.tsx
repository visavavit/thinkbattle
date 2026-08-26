import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { shareUrls } from "@/lib/site";

/**
 * Share intents for a closed topic's result. `url` and `text` are already
 * resolved by the caller — this component only lays out the buttons.
 *
 * `navigator.share`, when present, replaces the individual intent buttons
 * with one native sheet: on a phone that is the better affordance, and it
 * covers apps (LINE included) that a web intent link cannot address directly.
 */
export function ShareRow({ url, text }: { url: string; text: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const urls = shareUrls(url, text);

  async function nativeShare() {
    try {
      await navigator.share({ title: text, url });
    } catch {
      // The share sheet's own cancel throws AbortError — nothing to report.
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t("result.copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("vote.failed"));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-bold text-muted-foreground">{t("result.share")}</span>
      {canNativeShare ? (
        <Button type="button" variant="outline" size="sm" onClick={nativeShare}>
          <Share2 className="h-4 w-4" aria-hidden="true" />
          {t("result.shareNative")}
        </Button>
      ) : (
        <>
          <Button asChild type="button" variant="outline" size="sm">
            <a href={urls.line} target="_blank" rel="noopener noreferrer">
              {t("result.shareLine")}
            </a>
          </Button>
          <Button asChild type="button" variant="outline" size="sm">
            <a href={urls.x} target="_blank" rel="noopener noreferrer">
              {t("result.shareX")}
            </a>
          </Button>
          <Button asChild type="button" variant="outline" size="sm">
            <a href={urls.facebook} target="_blank" rel="noopener noreferrer">
              {t("result.shareFacebook")}
            </a>
          </Button>
        </>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={copyLink}>
        {copied ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
        {t("result.shareCopy")}
      </Button>
    </div>
  );
}
