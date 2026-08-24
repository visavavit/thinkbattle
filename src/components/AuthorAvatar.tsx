import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/** A commenter as the discussion needs them: a name and, maybe, a picture. */
export type Author = { username: string; avatar_url: string | null };

/**
 * Six tints for the no-picture fallback. Which one a name gets is fixed by the
 * name itself, so a commenter keeps the same colour everywhere and across
 * reloads — the picture is missing, not the identity.
 */
const TINTS = [
  "bg-side-a/15 text-side-a",
  "bg-side-b/15 text-side-b",
  "bg-primary/15 text-primary",
  "bg-muted-foreground/15 text-muted-foreground",
  "bg-foreground/10 text-foreground",
  "bg-accent text-accent-foreground",
];

function tintOf(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 1_000_003;
  return TINTS[hash % TINTS.length];
}

/**
 * Everyone without an uploaded picture — whoever they are — falls back to the
 * same generated mark, so a missing upload never reads as a different kind of
 * account.
 */
export function AuthorAvatar({
  author,
  className,
}: {
  author: Author | undefined;
  className?: string;
}) {
  const name = author?.username ?? "?";
  return (
    <Avatar className={className ?? "h-6 w-6"}>
      {author?.avatar_url ? <AvatarImage src={author.avatar_url} alt="" /> : null}
      <AvatarFallback className={`text-[10px] font-bold ${tintOf(name)}`}>
        {name.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
