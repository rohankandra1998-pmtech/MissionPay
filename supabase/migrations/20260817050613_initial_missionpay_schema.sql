create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.verification_status as enum ('unverified', 'pending', 'verified');
create type public.campaign_status as enum ('draft', 'published', 'closed');
create type public.donation_frequency as enum ('one_time', 'monthly');
create type public.donation_status as enum ('pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded');
create type public.recurring_status as enum ('pending', 'active', 'past_due', 'cancelled');

create table public.fundraisers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 120),
  organization_name text check (organization_name is null or char_length(organization_name) <= 180),
  bio text,
  avatar_url text,
  verification_status public.verification_status not null default 'unverified',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  fundraiser_id uuid not null references public.fundraisers(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 8 and 180),
  short_description text not null check (char_length(short_description) between 20 and 320),
  story text not null check (char_length(story) >= 100),
  category text not null,
  goal_amount_cents bigint not null check (goal_amount_cents between 10000 and 1000000000),
  currency text not null default 'USD' check (currency = 'USD'),
  cover_image_url text not null check (cover_image_url ~ '^https://'),
  impact_statement text not null check (char_length(impact_statement) >= 20),
  status public.campaign_status not null default 'draft',
  end_date timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint published_requires_timestamp check (status <> 'published' or published_at is not null)
);

create table public.donors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 255),
  email text not null unique check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recurring_donations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id),
  donor_id uuid not null references public.donors(id),
  amount_cents bigint not null check (amount_cents between 100 and 1000000),
  currency text not null default 'USD' check (currency = 'USD'),
  is_anonymous boolean not null default false,
  status public.recurring_status not null default 'pending',
  hyperswitch_customer_id text,
  hyperswitch_payment_method_reference text,
  hyperswitch_recurring_reference jsonb,
  started_at timestamptz not null default now(),
  next_charge_at timestamptz not null,
  billing_anchor_day smallint not null check (billing_anchor_day between 1 and 31),
  consent_captured_at timestamptz not null,
  cancelled_at timestamptz,
  management_token_hash text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cancelled_has_timestamp check (status <> 'cancelled' or cancelled_at is not null)
);

create table public.donations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id),
  donor_id uuid not null references public.donors(id),
  recurring_donation_id uuid references public.recurring_donations(id),
  amount_cents bigint not null check (amount_cents between 100 and 1000000),
  currency text not null default 'USD' check (currency = 'USD'),
  frequency public.donation_frequency not null,
  is_anonymous boolean not null default false,
  status public.donation_status not null default 'pending',
  hyperswitch_payment_id text unique,
  access_token_hash text not null unique,
  billing_period_start date,
  provider_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint recurring_link_matches_frequency check ((frequency = 'monthly') = (recurring_donation_id is not null))
);
create unique index donations_recurring_billing_period_unique
  on public.donations (recurring_donation_id, billing_period_start)
  where recurring_donation_id is not null and billing_period_start is not null;

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references public.donations(id) on delete cascade,
  hyperswitch_payment_id text not null unique,
  attempt_number integer not null check (attempt_number > 0),
  status text not null,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (donation_id, attempt_number)
);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'hyperswitch' check (provider = 'hyperswitch'),
  provider_event_id text not null unique,
  event_type text not null,
  payment_attempt_id uuid references public.payment_attempts(id),
  payload jsonb not null,
  provider_updated_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.campaign_metrics (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  raised_amount_cents bigint not null default 0,
  supporter_count bigint not null default 0,
  successful_donation_count bigint not null default 0,
  active_recurring_count bigint not null default 0,
  average_donation_cents bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table public.public_supporter_activity (
  id uuid primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  display_name text not null,
  amount_cents bigint not null,
  frequency public.donation_frequency not null,
  created_at timestamptz not null
);

create index campaigns_public_listing_idx on public.campaigns (published_at desc) where status = 'published';
create index campaigns_fundraiser_idx on public.campaigns (fundraiser_id, created_at desc);
create index donations_campaign_status_idx on public.donations (campaign_id, status, completed_at desc);
create index donations_donor_idx on public.donations (donor_id);
create index recurring_due_idx on public.recurring_donations (next_charge_at) where status = 'active';
create index payment_attempts_donation_idx on public.payment_attempts (donation_id, attempt_number desc);
create index payment_events_attempt_idx on public.payment_events (payment_attempt_id, created_at desc);
create index supporter_activity_campaign_idx on public.public_supporter_activity (campaign_id, created_at desc);

create or replace function private.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_fundraisers_updated_at before update on public.fundraisers for each row execute function private.set_updated_at();
create trigger set_campaigns_updated_at before update on public.campaigns for each row execute function private.set_updated_at();
create trigger set_donors_updated_at before update on public.donors for each row execute function private.set_updated_at();
create trigger set_donations_updated_at before update on public.donations for each row execute function private.set_updated_at();
create trigger set_recurring_updated_at before update on public.recurring_donations for each row execute function private.set_updated_at();
create trigger set_payment_attempts_updated_at before update on public.payment_attempts for each row execute function private.set_updated_at();

create or replace function private.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.fundraisers (user_id, display_name, organization_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)),
    nullif(trim(new.raw_user_meta_data ->> 'organization_name'), '')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_auth_user();

create or replace function private.refresh_campaign_metrics(target_campaign_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.campaign_metrics (
    campaign_id, raised_amount_cents, supporter_count, successful_donation_count,
    active_recurring_count, average_donation_cents, updated_at
  )
  select
    target_campaign_id,
    coalesce(sum(d.amount_cents) filter (where d.status = 'succeeded'), 0)::bigint,
    count(distinct d.donor_id) filter (where d.status = 'succeeded')::bigint,
    count(*) filter (where d.status = 'succeeded')::bigint,
    (select count(*) from public.recurring_donations r where r.campaign_id = target_campaign_id and r.status = 'active')::bigint,
    coalesce(avg(d.amount_cents) filter (where d.status = 'succeeded'), 0)::bigint,
    now()
  from public.donations d
  where d.campaign_id = target_campaign_id
  on conflict (campaign_id) do update set
    raised_amount_cents = excluded.raised_amount_cents,
    supporter_count = excluded.supporter_count,
    successful_donation_count = excluded.successful_donation_count,
    active_recurring_count = excluded.active_recurring_count,
    average_donation_cents = excluded.average_donation_cents,
    updated_at = excluded.updated_at;
end;
$$;
revoke all on function private.refresh_campaign_metrics(uuid) from public, anon, authenticated;

create or replace function private.sync_campaign_metrics()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_id uuid;
begin
  target_id := coalesce(new.campaign_id, old.campaign_id);
  perform private.refresh_campaign_metrics(target_id);
  return coalesce(new, old);
end;
$$;
revoke all on function private.sync_campaign_metrics() from public, anon, authenticated;
create trigger sync_metrics_from_donations after insert or update of status or delete on public.donations for each row execute function private.sync_campaign_metrics();
create trigger sync_metrics_from_recurring after insert or update of status or delete on public.recurring_donations for each row execute function private.sync_campaign_metrics();

create or replace function private.sync_public_supporter_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare donor_name text;
begin
  if new.status = 'succeeded' then
    select name into donor_name from public.donors where id = new.donor_id;
    insert into public.public_supporter_activity (id, campaign_id, display_name, amount_cents, frequency, created_at)
    values (new.id, new.campaign_id, case when new.is_anonymous then 'Anonymous' else donor_name end, new.amount_cents, new.frequency, coalesce(new.completed_at, new.created_at))
    on conflict (id) do update set display_name = excluded.display_name, amount_cents = excluded.amount_cents, frequency = excluded.frequency;
  else
    delete from public.public_supporter_activity where id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_public_supporter_activity() from public, anon, authenticated;
create trigger sync_public_activity after insert or update of status, is_anonymous on public.donations for each row execute function private.sync_public_supporter_activity();

alter table public.fundraisers enable row level security;
alter table public.campaigns enable row level security;
alter table public.donors enable row level security;
alter table public.donations enable row level security;
alter table public.recurring_donations enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.payment_events enable row level security;
alter table public.campaign_metrics enable row level security;
alter table public.public_supporter_activity enable row level security;

create policy "public fundraiser profiles are readable" on public.fundraisers for select to anon, authenticated using (true);
create policy "users create their fundraiser profile" on public.fundraisers for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "fundraisers update their profile" on public.fundraisers for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "published or owned campaigns are readable" on public.campaigns for select to anon, authenticated
  using (status = 'published' or exists (select 1 from public.fundraisers f where f.id = fundraiser_id and f.user_id = (select auth.uid())));
create policy "fundraisers create own campaigns" on public.campaigns for insert to authenticated
  with check (exists (select 1 from public.fundraisers f where f.id = fundraiser_id and f.user_id = (select auth.uid())));
create policy "fundraisers update own campaigns" on public.campaigns for update to authenticated
  using (exists (select 1 from public.fundraisers f where f.id = fundraiser_id and f.user_id = (select auth.uid())))
  with check (exists (select 1 from public.fundraisers f where f.id = fundraiser_id and f.user_id = (select auth.uid())));
create policy "fundraisers delete own draft campaigns" on public.campaigns for delete to authenticated
  using (status = 'draft' and exists (select 1 from public.fundraisers f where f.id = fundraiser_id and f.user_id = (select auth.uid())));

create policy "fundraisers read donors for own campaigns" on public.donors for select to authenticated
  using (exists (select 1 from public.donations d join public.campaigns c on c.id = d.campaign_id join public.fundraisers f on f.id = c.fundraiser_id where d.donor_id = donors.id and f.user_id = (select auth.uid())));
create policy "fundraisers read donations for own campaigns" on public.donations for select to authenticated
  using (exists (select 1 from public.campaigns c join public.fundraisers f on f.id = c.fundraiser_id where c.id = donations.campaign_id and f.user_id = (select auth.uid())));
create policy "fundraisers read recurring plans for own campaigns" on public.recurring_donations for select to authenticated
  using (exists (select 1 from public.campaigns c join public.fundraisers f on f.id = c.fundraiser_id where c.id = recurring_donations.campaign_id and f.user_id = (select auth.uid())));
create policy "fundraisers read payment attempts for own campaigns" on public.payment_attempts for select to authenticated
  using (exists (select 1 from public.donations d join public.campaigns c on c.id = d.campaign_id join public.fundraisers f on f.id = c.fundraiser_id where d.id = payment_attempts.donation_id and f.user_id = (select auth.uid())));

create policy "published or owned campaign metrics are readable" on public.campaign_metrics for select to anon, authenticated
  using (exists (select 1 from public.campaigns c left join public.fundraisers f on f.id = c.fundraiser_id where c.id = campaign_metrics.campaign_id and (c.status = 'published' or f.user_id = (select auth.uid()))));
create policy "published or owned supporter activity is readable" on public.public_supporter_activity for select to anon, authenticated
  using (exists (select 1 from public.campaigns c left join public.fundraisers f on f.id = c.fundraiser_id where c.id = public_supporter_activity.campaign_id and (c.status = 'published' or f.user_id = (select auth.uid()))));

grant usage on schema public to anon, authenticated;
grant select on public.fundraisers, public.campaigns, public.campaign_metrics, public.public_supporter_activity to anon, authenticated;
grant insert, update on public.fundraisers to authenticated;
grant insert, update, delete on public.campaigns to authenticated;
grant select on public.donors, public.donations, public.recurring_donations, public.payment_attempts to authenticated;
revoke all on public.payment_events from anon, authenticated;

insert into public.fundraisers (id, display_name, organization_name, bio, avatar_url, verification_status)
values ('10000000-0000-4000-8000-000000000001', 'Maya Okafor', 'Waterline Collective', 'Community-led infrastructure for clean water access.', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80', 'verified');

insert into public.campaigns (id, fundraiser_id, slug, title, short_description, story, category, goal_amount_cents, cover_image_url, impact_statement, status, end_date, published_at)
values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','clean-water-rural-communities','Clean Water for Rural Communities','Help three rural communities build locally maintained wells and dependable clean-water access.','In the Lower River region, families still walk miles each morning to collect water that is not always safe. Waterline Collective has worked alongside local councils and women-led committees to map three well sites, train maintenance teams, and establish transparent community funds for repairs.\n\nThis campaign funds drilling, hand-pump installation, water-quality testing, and a full year of maintenance training. Local teams lead every decision, and progress updates will document each completed milestone.','Community',2000000,'https://images.unsplash.com/photo-1542810634-71277d95dcbb?auto=format&fit=crop&w=1800&q=85','Every $100 helps fund safe water access and local maintenance training for one family.', 'published', now() + interval '90 days', now() - interval '40 days'),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','library-after-the-storm','Rebuild the Library After the Storm','Restore books, learning spaces, and after-school programs for 240 students after severe flooding.','Floodwater destroyed most of Northside Learning Center’s books, computers, and furniture. Teachers and parents have already cleared the building and completed essential repairs. The next step is to rebuild the place where students read, study, and receive tutoring after school.\n\nFunds will replace age-appropriate books, twelve shared laptops, modular furniture, and learning materials chosen by teachers. The center will publish receipts and a reopening report for supporters.','Education',3500000,'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1800&q=85','A $50 gift replaces a classroom set of books; $250 restores a complete student workstation.', 'published', now() + interval '70 days', now() - interval '24 days'),
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','care-for-elena','Care and Recovery for Elena','Support travel, rehabilitation, and daily care while Elena recovers from complex surgery.','Elena is a teacher, a devoted aunt, and the person her neighbors call when they need help. After an unexpected diagnosis, she now faces surgery followed by several months of rehabilitation away from home.\n\nHer family has covered the initial medical costs. This campaign focuses on the overlooked parts of recovery: accessible transport, temporary lodging near the hospital, physical therapy, and reliable home support when she returns.','Medical',5000000,'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1800&q=85','Your support gives Elena consistent care and gives her family room to focus on recovery.', 'published', now() + interval '120 days', now() - interval '17 days'),
('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','restore-salt-marsh','Restore the Harbor Salt Marsh','Replant native grasses and rebuild a living shoreline that protects homes and wildlife.','The harbor salt marsh is a nursery for fish, a rest stop for migrating birds, and one of the community’s strongest natural defenses against flooding. Years of erosion have reduced the marsh edge and weakened its ability to absorb storm water.\n\nLocal conservation crews will install biodegradable barriers, replant native grasses, and monitor the shoreline for eighteen months with university partners.','Environment',2800000,'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1800&q=85','Each $75 restores and monitors one square meter of living shoreline.', 'published', now() + interval '150 days', now() - interval '31 days'),
('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','safe-nights-rescue','Safe Nights for Rescue Animals','Expand emergency foster capacity so rescued animals have safe, quiet care before adoption.','When the county shelter reaches capacity, animals recovering from injury or neglect need temporary homes immediately. Safe Nights coordinates trained foster families, veterinary partners, and transport volunteers so vulnerable animals do not fall through the gaps.\n\nThis campaign funds emergency veterinary assessments, foster starter kits, medication, and safe transport for the next six months.','Animal welfare',1800000,'https://images.unsplash.com/photo-1450778869180-41d0601e046e?auto=format&fit=crop&w=1800&q=85','A $40 donation equips one foster home; $120 covers an emergency veterinary assessment.', 'published', now() + interval '80 days', now() - interval '12 days');

insert into public.donors (id, name, email)
select gen_random_uuid(), 'Supporter ' || n, 'supporter' || n || '@missionpay.demo'
from generate_series(1, 213) n;

with ranked as (select id, row_number() over (order by email) n from public.donors)
insert into public.donations (campaign_id, donor_id, amount_cents, frequency, is_anonymous, status, access_token_hash, completed_at, created_at)
select
  case when n <= 183 then '20000000-0000-4000-8000-000000000001'::uuid
       when n <= 195 then '20000000-0000-4000-8000-000000000002'::uuid
       when n <= 203 then '20000000-0000-4000-8000-000000000003'::uuid
       when n <= 208 then '20000000-0000-4000-8000-000000000004'::uuid
       else '20000000-0000-4000-8000-000000000005'::uuid end,
  id,
  case when n = 183 then 335000 when n <= 183 then 5000 when n <= 195 then 7500 when n <= 203 then 10000 when n <= 208 then 15000 else 4000 end,
  'one_time'::public.donation_frequency,
  (n % 7 = 0),
  'succeeded'::public.donation_status,
  encode(digest('seed-access-' || n, 'sha256'), 'hex'),
  now() - make_interval(days => (n % 38)::integer),
  now() - make_interval(days => (n % 38)::integer)
from ranked;

insert into public.campaign_metrics (campaign_id)
select id from public.campaigns on conflict do nothing;
select private.refresh_campaign_metrics(id) from public.campaigns;
