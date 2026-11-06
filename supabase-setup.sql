-- PinBoard public pins — Supabase setup for project pesalink
-- Run in Supabase Dashboard > SQL Editor. Safe to run again: tables use
-- IF NOT EXISTS, policies are dropped + recreated, seeds use fixed ids
-- with ON CONFLICT DO NOTHING so re-running adds nothing twice.
-- Seed images are free Pexels photos (images.pexels.com). No secrets here.

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  name text not null,
  private boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.pins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  author_name text,
  title text not null,
  description text,
  link text,
  category text not null default 'Other',
  topics jsonb not null default '[]'::jsonb,
  board_id uuid references public.boards(id) on delete set null,
  board_private boolean not null default false,
  image text,
  media jsonb not null default '[]'::jsonb,
  layout text not null default 'single',
  product jsonb,
  comments_allowed boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.boards enable row level security;
alter table public.pins enable row level security;

drop policy if exists "pins public read" on public.pins;
create policy "pins public read" on public.pins for select using (true);
drop policy if exists "pins insert own" on public.pins;
create policy "pins insert own" on public.pins for insert with check (auth.uid() = user_id);
drop policy if exists "pins update own" on public.pins;
create policy "pins update own" on public.pins for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "pins delete own" on public.pins;
create policy "pins delete own" on public.pins for delete using (auth.uid() = user_id);

drop policy if exists "boards public read" on public.boards;
create policy "boards public read" on public.boards for select using (true);
drop policy if exists "boards insert own" on public.boards;
create policy "boards insert own" on public.boards for insert with check (auth.uid() = user_id);
drop policy if exists "boards update own" on public.boards;
create policy "boards update own" on public.boards for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "boards delete own" on public.boards;
create policy "boards delete own" on public.boards for delete using (auth.uid() = user_id);

-- Seed boards (owned by nobody: user_id NULL, so nobody can delete them from the app)
insert into public.boards (id, user_id, name, private) values
  ('11111111-1111-1111-1111-111111111111', null, 'Wallpapers', false),
  ('22222222-2222-2222-2222-222222222222', null, 'Dream rooms', false),
  ('33333333-3333-3333-3333-333333333333', null, 'Dream cars', false),
  ('44444444-4444-4444-4444-444444444444', null, 'Movie nights', false),
  ('55555555-5555-5555-5555-555555555555', null, 'Cool finds', false)
on conflict (id) do nothing;

-- Seed pins (30 free Pexels photos, owned by nobody, author PinBoard)
insert into public.pins (id, user_id, author_name, title, description, link, category, topics, board_id, board_private, image, media, layout, product, comments_allowed) values
  ('00000000-0000-4000-8000-000000000001', null, 'PinBoard', 'Mountain peaks at dawn', 'Snowy peaks under a soft morning sky. Free wallpaper.', '', 'Other', '["Other"]'::jsonb, '11111111-1111-1111-1111-111111111111', false, 'https://images.pexels.com/photos/6047560/pexels-photo-6047560.jpeg?auto=compress&cs=tinysrgb&w=600&loading=lazy', '[{"type": "image", "url": "https://images.pexels.com/photos/6047560/pexels-photo-6047560.jpeg?auto=compress&cs=tinysrgb&w=600&loading=lazy"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000002', null, 'PinBoard', 'Alpine sunrise', 'Golden light over an alpine valley.', '', 'Other', '["Other"]'::jsonb, '11111111-1111-1111-1111-111111111111', false, 'https://images.pexels.com/photos/34229761/pexels-photo-34229761/free-photo-of-majestic-alpine-mountain-landscape-at-sunrise.jpeg?auto=compress&cs=tinysrgb&w=600&loading=lazy', '[{"type": "image", "url": "https://images.pexels.com/photos/34229761/pexels-photo-34229761/free-photo-of-majestic-alpine-mountain-landscape-at-sunrise.jpeg?auto=compress&cs=tinysrgb&w=600&loading=lazy"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000003', null, 'PinBoard', 'Mountain ridge', 'Brown ridges stretching to the horizon.', '', 'Other', '["Other"]'::jsonb, '11111111-1111-1111-1111-111111111111', false, 'https://images.pexels.com/photos/4467594/pexels-photo-4467594.jpeg?w=600', '[{"type": "image", "url": "https://images.pexels.com/photos/4467594/pexels-photo-4467594.jpeg?w=600"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000004', null, 'PinBoard', 'Waves at sunset', 'Golden sunset over gentle beach waves.', '', 'Other', '["Other"]'::jsonb, '11111111-1111-1111-1111-111111111111', false, 'https://images.pexels.com/photos/23031324/pexels-photo-23031324/free-photo-of-view-of-waves-washing-up-the-beach-at-sunset.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500', '[{"type": "image", "url": "https://images.pexels.com/photos/23031324/pexels-photo-23031324/free-photo-of-view-of-waves-washing-up-the-beach-at-sunset.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000005', null, 'PinBoard', 'Beach sunset', 'Warm evening light on the shore.', '', 'Other', '["Other"]'::jsonb, '11111111-1111-1111-1111-111111111111', false, 'https://images.pexels.com/photos/14433838/pexels-photo-14433838.jpeg?auto=compress&cs=tinysrgb&w=600&loading=lazy', '[{"type": "image", "url": "https://images.pexels.com/photos/14433838/pexels-photo-14433838.jpeg?auto=compress&cs=tinysrgb&w=600&loading=lazy"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000006', null, 'PinBoard', 'City skyline', 'Skyscrapers glowing after dark.', '', 'Other', '["Other"]'::jsonb, '11111111-1111-1111-1111-111111111111', false, 'https://images.pexels.com/photos/2260835/pexels-photo-2260835.jpeg?auto=compress&cs=tinysrgb&w=1200&loading=lazy', '[{"type": "image", "url": "https://images.pexels.com/photos/2260835/pexels-photo-2260835.jpeg?auto=compress&cs=tinysrgb&w=1200&loading=lazy"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000007', null, 'PinBoard', 'City lights', 'Streets and towers lit up at night.', '', 'Other', '["Other"]'::jsonb, '11111111-1111-1111-1111-111111111111', false, 'https://images.pexels.com/photos/13278934/pexels-photo-13278934.jpeg?auto=compress&cs=tinysrgb&w=600&loading=lazy', '[{"type": "image", "url": "https://images.pexels.com/photos/13278934/pexels-photo-13278934.jpeg?auto=compress&cs=tinysrgb&w=600&loading=lazy"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000008', null, 'PinBoard', 'Galaxy stars', 'A sky full of stars, far from the city.', '', 'Other', '["Other"]'::jsonb, '11111111-1111-1111-1111-111111111111', false, 'https://images.pexels.com/photos/27101596/pexels-photo-27101596.jpeg?auto=compress&cs=tinysrgb&h=627&fit=crop&w=1200', '[{"type": "image", "url": "https://images.pexels.com/photos/27101596/pexels-photo-27101596.jpeg?auto=compress&cs=tinysrgb&h=627&fit=crop&w=1200"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000009', null, 'PinBoard', 'Stars in space', 'Deep space, endless stars.', '', 'Other', '["Other"]'::jsonb, '11111111-1111-1111-1111-111111111111', false, 'https://images.pexels.com/photos/26607691/pexels-photo-26607691/free-photo-of-stars-in-space.png?w=600', '[{"type": "image", "url": "https://images.pexels.com/photos/26607691/pexels-photo-26607691/free-photo-of-stars-in-space.png?w=600"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000010', null, 'PinBoard', 'Foggy forest', 'Quiet trees wrapped in morning fog.', '', 'Other', '["Other"]'::jsonb, '11111111-1111-1111-1111-111111111111', false, 'https://images.pexels.com/photos/2582526/pexels-photo-2582526.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500', '[{"type": "image", "url": "https://images.pexels.com/photos/2582526/pexels-photo-2582526.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000011', null, 'PinBoard', 'Colour splash', 'Bold abstract colours for your screen.', '', 'Other', '["Other"]'::jsonb, '11111111-1111-1111-1111-111111111111', false, 'https://images.pexels.com/photos/35083289/pexels-photo-35083289.jpeg?auto=compress&cs=tinysrgb&w=600&loading=lazy', '[{"type": "image", "url": "https://images.pexels.com/photos/35083289/pexels-photo-35083289.jpeg?auto=compress&cs=tinysrgb&w=600&loading=lazy"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000012', null, 'PinBoard', 'Abstract flow', 'Smooth abstract shapes in soft colour.', '', 'Other', '["Other"]'::jsonb, '11111111-1111-1111-1111-111111111111', false, 'https://images.pexels.com/photos/34229972/pexels-photo-34229972.jpeg?auto=compress&cs=tinysrgb&w=600&loading=lazy', '[{"type": "image", "url": "https://images.pexels.com/photos/34229972/pexels-photo-34229972.jpeg?auto=compress&cs=tinysrgb&w=600&loading=lazy"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000013', null, 'PinBoard', 'Bright living room', 'Airy living room with soft light and plants.', '', 'Room', '["Room"]'::jsonb, '22222222-2222-2222-2222-222222222222', false, 'https://images.pexels.com/photos/7534553/pexels-photo-7534553.jpeg?auto=compress&cs=tinysrgb&w=1600&loading=lazy', '[{"type": "image", "url": "https://images.pexels.com/photos/7534553/pexels-photo-7534553.jpeg?auto=compress&cs=tinysrgb&w=1600&loading=lazy"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000014', null, 'PinBoard', 'Lamp-lit living room', 'Warm lamp light for slow evenings.', '', 'Room', '["Room"]'::jsonb, '22222222-2222-2222-2222-222222222222', false, 'https://images.pexels.com/photos/5998138/pexels-photo-5998138.jpeg?w=600', '[{"type": "image", "url": "https://images.pexels.com/photos/5998138/pexels-photo-5998138.jpeg?w=600"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000015', null, 'PinBoard', 'Calm bedroom', 'Soft tones and clean lines for better sleep.', '', 'Room', '["Room"]'::jsonb, '22222222-2222-2222-2222-222222222222', false, 'https://images.pexels.com/photos/2082087/pexels-photo-2082087.jpeg?w=600', '[{"type": "image", "url": "https://images.pexels.com/photos/2082087/pexels-photo-2082087.jpeg?w=600"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000016', null, 'PinBoard', 'Bedroom design', 'Simple bedroom layout with warm wood.', '', 'Room', '["Room"]'::jsonb, '22222222-2222-2222-2222-222222222222', false, 'https://images.pexels.com/photos/7214326/pexels-photo-7214326.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500', '[{"type": "image", "url": "https://images.pexels.com/photos/7214326/pexels-photo-7214326.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000017', null, 'PinBoard', 'Night rider', 'Sports car glowing on a night street.', '', 'Car', '["Car"]'::jsonb, '33333333-3333-3333-3333-333333333333', false, 'https://images.pexels.com/photos/15757867/pexels-photo-15757867/free-photo-of-jalan-malam-malam-hari-mobil-sport.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500', '[{"type": "image", "url": "https://images.pexels.com/photos/15757867/pexels-photo-15757867/free-photo-of-jalan-malam-malam-hari-mobil-sport.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000018', null, 'PinBoard', 'Dream sports car', 'Low, fast and shining.', '', 'Car', '["Car"]'::jsonb, '33333333-3333-3333-3333-333333333333', false, 'https://images.pexels.com/photos/12339867/pexels-photo-12339867.jpeg?auto=compress&cs=tinysrgb&w=1600&loading=lazy', '[{"type": "image", "url": "https://images.pexels.com/photos/12339867/pexels-photo-12339867.jpeg?auto=compress&cs=tinysrgb&w=1600&loading=lazy"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000019', null, 'PinBoard', 'Sports car side', 'Clean lines, parked and ready.', '', 'Car', '["Car"]'::jsonb, '33333333-3333-3333-3333-333333333333', false, 'https://images.pexels.com/photos/16043874/pexels-photo-16043874.jpeg?auto=compress&cs=tinysrgb&w=600&loading=lazy', '[{"type": "image", "url": "https://images.pexels.com/photos/16043874/pexels-photo-16043874.jpeg?auto=compress&cs=tinysrgb&w=600&loading=lazy"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000020', null, 'PinBoard', 'Cinema night', 'The big screen, the dark hall, the smell of popcorn.', '', 'Movie', '["Movie"]'::jsonb, '44444444-4444-4444-4444-444444444444', false, 'https://images.pexels.com/photos/7234321/pexels-photo-7234321.jpeg?auto=compress&cs=tinysrgb&w=1200&loading=lazy', '[{"type": "image", "url": "https://images.pexels.com/photos/7234321/pexels-photo-7234321.jpeg?auto=compress&cs=tinysrgb&w=1200&loading=lazy"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000021', null, 'PinBoard', 'Cinema seats', 'Rows of red seats waiting for the film.', '', 'Movie', '["Movie"]'::jsonb, '44444444-4444-4444-4444-444444444444', false, 'https://images.pexels.com/photos/7234242/pexels-photo-7234242.jpeg?auto=compress&cs=tinysrgb&w=600', '[{"type": "image", "url": "https://images.pexels.com/photos/7234242/pexels-photo-7234242.jpeg?auto=compress&cs=tinysrgb&w=600"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000022', null, 'PinBoard', 'Movie date', 'Two seats, one film, popcorn in hand.', '', 'Movie', '["Movie"]'::jsonb, '44444444-4444-4444-4444-444444444444', false, 'https://images.pexels.com/photos/7234248/pexels-photo-7234248.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1', '[{"type": "image", "url": "https://images.pexels.com/photos/7234248/pexels-photo-7234248.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000023', null, 'PinBoard', 'Movie night', 'Lights down, film on.', '', 'Movie', '["Movie"]'::jsonb, '44444444-4444-4444-4444-444444444444', false, 'https://images.pexels.com/photos/7234311/pexels-photo-7234311.jpeg?w=600', '[{"type": "image", "url": "https://images.pexels.com/photos/7234311/pexels-photo-7234311.jpeg?w=600"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000024', null, 'PinBoard', 'Headphones', 'Deep sound, no noise.', '', 'Item', '["Item"]'::jsonb, '55555555-5555-5555-5555-555555555555', false, 'https://images.pexels.com/photos/205926/pexels-photo-205926.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200', '[{"type": "image", "url": "https://images.pexels.com/photos/205926/pexels-photo-205926.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000025', null, 'PinBoard', 'Headphones close-up', 'Macro shot of classic headphones.', '', 'Item', '["Item"]'::jsonb, '55555555-5555-5555-5555-555555555555', false, 'https://images.pexels.com/photos/361763/pexels-photo-361763.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1', '[{"type": "image", "url": "https://images.pexels.com/photos/361763/pexels-photo-361763.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000026', null, 'PinBoard', 'Street sneakers', 'Fresh kicks for the street.', '', 'Item', '["Item"]'::jsonb, '55555555-5555-5555-5555-555555555555', false, 'https://images.pexels.com/photos/2016144/pexels-photo-2016144.jpeg?auto=compress&cs=tinysrgb&w=600&loading=lazy', '[{"type": "image", "url": "https://images.pexels.com/photos/2016144/pexels-photo-2016144.jpeg?auto=compress&cs=tinysrgb&w=600&loading=lazy"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000027', null, 'PinBoard', 'Sneakers on the move', 'Built to walk far.', '', 'Item', '["Item"]'::jsonb, '55555555-5555-5555-5555-555555555555', false, 'https://images.pexels.com/photos/7575998/pexels-photo-7575998.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500', '[{"type": "image", "url": "https://images.pexels.com/photos/7575998/pexels-photo-7575998.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000028', null, 'PinBoard', 'Luxury watch', 'A watch that means business.', '', 'Item', '["Item"]'::jsonb, '55555555-5555-5555-5555-555555555555', false, 'https://images.pexels.com/photos/6208594/pexels-photo-6208594.jpeg?auto=compress&cs=tinysrgb&w=600&loading=lazy', '[{"type": "image", "url": "https://images.pexels.com/photos/6208594/pexels-photo-6208594.jpeg?auto=compress&cs=tinysrgb&w=600&loading=lazy"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000029', null, 'PinBoard', 'Vintage camera', 'Old-school film camera, still beautiful.', '', 'Item', '["Item"]'::jsonb, '55555555-5555-5555-5555-555555555555', false, 'https://images.pexels.com/photos/16422725/pexels-photo-16422725/free-photo-of-vintage-analogue-camera.jpeg?w=600', '[{"type": "image", "url": "https://images.pexels.com/photos/16422725/pexels-photo-16422725/free-photo-of-vintage-analogue-camera.jpeg?w=600"}]'::jsonb, 'single', null, true),
  ('00000000-0000-4000-8000-000000000030', null, 'PinBoard', 'Big burger', 'Stacked high and worth every bite.', '', 'Other', '["Other"]'::jsonb, '55555555-5555-5555-5555-555555555555', false, 'https://images.pexels.com/photos/1639557/pexels-photo-1639557.jpeg?auto=compress&w=1600', '[{"type": "image", "url": "https://images.pexels.com/photos/1639557/pexels-photo-1639557.jpeg?auto=compress&w=1600"}]'::jsonb, 'single', null, true)
on conflict (id) do nothing;

select 'boards', count(*) from public.boards union all select 'pins', count(*) from public.pins;
