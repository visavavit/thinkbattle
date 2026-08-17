ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

UPDATE public.topics SET cover_image_url = '/__l5e/assets-v1/50014cad-abe6-4d13-9911-718e1d6490e7/cats-dogs.jpg' WHERE id = '2738c960-df7f-447a-b953-f2fa9863f6a1';
UPDATE public.topics SET cover_image_url = '/__l5e/assets-v1/2af41607-e68a-45d5-91b9-ad81774a287b/ai-emails.jpg' WHERE id = '2f96a259-3db7-481e-9296-d1edf2f20cfb';
UPDATE public.topics SET cover_image_url = '/__l5e/assets-v1/8da0732d-a212-4110-9b2a-9b40a0229b4e/tabs-spaces.jpg' WHERE id = '3a8102a9-64cd-4d5f-b215-41a5861fba40';
UPDATE public.topics SET cover_image_url = '/__l5e/assets-v1/436e02d3-9d51-4a22-ba40-7515f171f8d8/workout.jpg' WHERE id = '6b6ac3a8-e74f-4bdd-be6f-6c93ca5078b0';
UPDATE public.topics SET cover_image_url = '/__l5e/assets-v1/e029d5de-30ef-4a66-b614-20dd41ed87be/movies.jpg' WHERE id = '71b7d29e-a5e6-47d3-b82a-88dcad235211';
UPDATE public.topics SET cover_image_url = '/__l5e/assets-v1/ba623feb-7e6f-4156-adf0-a55e8872ac67/hotdog.jpg' WHERE id = '9e899f6e-6461-4875-9517-c6099cc18a67';
UPDATE public.topics SET cover_image_url = '/__l5e/assets-v1/15726370-9779-4663-8aa1-0e2eb4084f1f/pineapple.jpg' WHERE id = 'a62d69b4-207d-4cea-8281-139cb10e0360';
UPDATE public.topics SET cover_image_url = '/__l5e/assets-v1/2f650ddd-588d-48b7-9d17-caf515d84ebd/phones.jpg' WHERE id = 'fcffe5b9-68cb-461a-9773-0d53d456eb98';

CREATE OR REPLACE VIEW public.topic_cards AS
 SELECT t.id,
    t.title,
    t.description,
    t.choice_a,
    t.choice_b,
    t.status,
    t.submitted_by,
    t.votes_a,
    t.votes_b,
    t.created_at,
    t.published_at,
    c.name AS category_name,
    c.slug AS category_slug,
    c.emoji AS category_emoji,
    t.category_id,
    t.votes_a + t.votes_b AS total_votes,
        CASE
            WHEN (t.votes_a + t.votes_b) = 0 THEN 50::numeric
            ELSE round(100.0 * t.votes_a::numeric / (t.votes_a + t.votes_b)::numeric)
        END AS pct_a,
    COALESCE(( SELECT array_agg(tg.name ORDER BY tg.name) AS array_agg
           FROM topic_tags tt
             JOIN tags tg ON tg.id = tt.tag_id
          WHERE tt.topic_id = t.id), '{}'::text[]) AS tags,
    ( SELECT count(*) AS count
           FROM comments cm
          WHERE cm.topic_id = t.id) AS comments_count,
    ( SELECT count(*) AS count
           FROM comments cm
          WHERE cm.topic_id = t.id AND cm.controversy_score >= 6) AS wild_takes_count,
    (t.votes_a + t.votes_b + 1)::numeric / power(2::numeric + EXTRACT(epoch FROM now() - COALESCE(t.published_at, t.created_at)) / 3600.0, 1.2) AS trending_score,
    t.cover_image_url
   FROM topics t
     LEFT JOIN categories c ON c.id = t.category_id;