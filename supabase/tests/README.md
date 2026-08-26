# Database behaviour tests

`run.sh` replays every file in `supabase/migrations` against a throwaway local
Postgres 16 cluster, then runs each `*.sql` test in this directory against the
result. It never touches the real project.

```sh
supabase/tests/run.sh                       # expects /usr/lib/postgresql/16/bin
supabase/tests/run.sh /opt/homebrew/opt/postgresql@16/bin
```

Postgres refuses to run as root, so run this as an ordinary user.

## Why these exist

The rules that make image attachments safe are in triggers and definer
functions, not in application code: you may only post an upload you made,
an attachment cannot be swapped after posting, hiding a take takes its picture
down, and nothing reaches storage without a ledger row that can delete it
again. None of that is reachable from a unit test, and an untested trigger is a
comment with syntax highlighting.

`comment_images.sql` also covers the paths those triggers could plausibly
break but must not: liking a take, editing one, posting a plain text take,
guest voting, and both admin moderation feeds.

## Known replay failures

Two migrations fail to replay and are expected to. Neither is a problem with
the file — both are artifacts of replaying a history that was not written in
one sitting:

- `20260825152935_…` is a re-application of `20260825120000_…`; the second run
  trips over a policy the first one created.
- `20260826080358_…` redefines the `topic_cards` view with fewer columns than
  it already has, which Postgres refuses. The later `20260826120000_…`
  redeclares that view anyway, so the end state is correct.

The shim in `00-supabase-shim.sql` stands in for what a Supabase project
provides and plain Postgres does not: the `auth` schema and `auth.uid()`, the
`anon`/`authenticated`/`service_role` roles, the realtime publication, and
no-op `cron`/`net` schemas.
