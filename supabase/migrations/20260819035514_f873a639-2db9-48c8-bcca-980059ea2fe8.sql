update public.topics
set cover_image_url = replace(cover_image_url, 'https://pub-572df357577d400f9ae61ae37b0d1eca.r2.dev', 'https://img.toktiang.com')
where cover_image_url like 'https://pub-572df357577d400f9ae61ae37b0d1eca.r2.dev%';

update public.profiles
set avatar_url = replace(avatar_url, 'https://pub-572df357577d400f9ae61ae37b0d1eca.r2.dev', 'https://img.toktiang.com')
where avatar_url like 'https://pub-572df357577d400f9ae61ae37b0d1eca.r2.dev%';