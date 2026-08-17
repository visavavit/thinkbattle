# Grant admin to the current account

There is exactly one registered account: **visavavit.s@gmail.com**. It currently has no admin role.

## Change

- Add an admin role row for that account so it gets full curator access: publishing topics, managing categories and tags, and reviewing the suggestion queue.
- Safe to re-run: if the role already exists, nothing is duplicated.

## Technical detail

Insert into `public.user_roles` (`user_id`, `role = 'admin'`) for user id `150cc341-f4a9-437e-8a78-a4d107d0a300`, with `on conflict do nothing`.

After this, sign out and back in (or reload) so the admin dashboard link appears.
