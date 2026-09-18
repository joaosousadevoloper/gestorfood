-- Giro Pizza: execute este arquivo no SQL Editor de um projeto Supabase novo.
create extension if not exists pgcrypto;

create type public.member_role as enum ('owner','manager','cashier','kitchen','driver');
create type public.order_status as enum ('new','production','ready','delivery','completed','cancelled');
create type public.order_type as enum ('delivery','pickup','counter');
create type public.cash_movement_type as enum ('opening','sale','withdrawal','supply','expense','closing');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now()
);
create table public.establishments (
  id uuid primary key default gen_random_uuid(), name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'), phone text,
  created_at timestamptz not null default now()
);
create table public.memberships (
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'cashier', primary key (establishment_id, user_id)
);
create table public.customers (
  id uuid primary key default gen_random_uuid(), establishment_id uuid not null references public.establishments(id) on delete cascade,
  name text not null, phone text, address text, notes text, created_at timestamptz not null default now()
);
create table public.menu_categories (
  id uuid primary key default gen_random_uuid(), establishment_id uuid not null references public.establishments(id) on delete cascade,
  name text not null, position integer not null default 0, active boolean not null default true
);
create table public.menu_items (
  id uuid primary key default gen_random_uuid(), establishment_id uuid not null references public.establishments(id) on delete cascade,
  category_id uuid references public.menu_categories(id) on delete set null, name text not null, description text,
  price numeric(12,2) not null check(price >= 0), active boolean not null default true, created_at timestamptz not null default now()
);
create table public.orders (
  id uuid primary key default gen_random_uuid(), establishment_id uuid not null references public.establishments(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null, order_number bigint generated always as identity,
  status public.order_status not null default 'new', type public.order_type not null default 'counter',
  delivery_address text, total numeric(12,2) not null default 0 check(total >= 0), notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null, name text not null, quantity numeric(10,2) not null default 1 check(quantity > 0), unit_price numeric(12,2) not null check(unit_price >= 0), notes text
);
create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(), establishment_id uuid not null references public.establishments(id) on delete cascade,
  opened_by uuid not null references public.profiles(id), opened_at timestamptz not null default now(), opening_balance numeric(12,2) not null default 0,
  closed_at timestamptz, closing_balance numeric(12,2)
);
create table public.cash_movements (
  id uuid primary key default gen_random_uuid(), establishment_id uuid not null references public.establishments(id) on delete cascade,
  session_id uuid references public.cash_sessions(id) on delete set null, order_id uuid references public.orders(id) on delete set null,
  type public.cash_movement_type not null, amount numeric(12,2) not null, description text, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table public.drivers (
  id uuid primary key default gen_random_uuid(), establishment_id uuid not null references public.establishments(id) on delete cascade,
  name text not null, phone text, active boolean not null default true
);
create table public.deliveries (
  id uuid primary key default gen_random_uuid(), establishment_id uuid not null references public.establishments(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade, driver_id uuid references public.drivers(id) on delete set null,
  dispatched_at timestamptz, delivered_at timestamptz
);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles(id, full_name) values(new.id, coalesce(new.raw_user_meta_data->>'full_name','')); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.is_member(target_establishment uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.memberships where establishment_id = target_establishment and user_id = auth.uid());
$$;
create or replace function public.is_manager(target_establishment uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.memberships where establishment_id = target_establishment and user_id = auth.uid() and role in ('owner','manager'));
$$;
create or replace function public.create_establishment(store_name text, store_slug text, store_phone text default null) returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  insert into public.establishments(name,slug,phone) values(store_name,store_slug,store_phone) returning id into new_id;
  insert into public.memberships(establishment_id,user_id,role) values(new_id,auth.uid(),'owner');
  return new_id;
end; $$;
grant execute on function public.create_establishment(text,text,text) to authenticated;

alter table public.profiles enable row level security;
alter table public.establishments enable row level security;
alter table public.memberships enable row level security;
alter table public.customers enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;
alter table public.drivers enable row level security;
alter table public.deliveries enable row level security;

create policy "profile: own" on public.profiles for select using(id = auth.uid());
create policy "establishment: members read" on public.establishments for select using(public.is_member(id));
create policy "membership: members read" on public.memberships for select using(public.is_member(establishment_id));
create policy "membership: owner manages" on public.memberships for all using(public.is_manager(establishment_id)) with check(public.is_manager(establishment_id));

create policy "customers: members" on public.customers for all using(public.is_member(establishment_id)) with check(public.is_member(establishment_id));
create policy "categories: members" on public.menu_categories for all using(public.is_member(establishment_id)) with check(public.is_manager(establishment_id));
create policy "items: members" on public.menu_items for all using(public.is_member(establishment_id)) with check(public.is_manager(establishment_id));
create policy "orders: members" on public.orders for all using(public.is_member(establishment_id)) with check(public.is_member(establishment_id));
create policy "cash sessions: members" on public.cash_sessions for all using(public.is_member(establishment_id)) with check(public.is_member(establishment_id));
create policy "cash movements: members" on public.cash_movements for all using(public.is_member(establishment_id)) with check(public.is_member(establishment_id));
create policy "drivers: members" on public.drivers for all using(public.is_member(establishment_id)) with check(public.is_manager(establishment_id));
create policy "deliveries: members" on public.deliveries for all using(public.is_member(establishment_id)) with check(public.is_member(establishment_id));
create policy "order items: members" on public.order_items for all using(exists(select 1 from public.orders o where o.id=order_id and public.is_member(o.establishment_id))) with check(exists(select 1 from public.orders o where o.id=order_id and public.is_member(o.establishment_id)));
