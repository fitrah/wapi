create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'free',
  max_numbers integer not null default 1,
  daily_message_limit integer not null default 1000,
  notification_email text,
  api_key_hash text not null,
  created_at timestamptz not null default now()
);

create table whatsapp_numbers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  label text not null,
  phone text,
  status text not null default 'disconnected',
  last_qr text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  number_id uuid not null references whatsapp_numbers(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  recipient text,
  sender text,
  body text not null,
  status text not null default 'queued',
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table webhooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  url text not null,
  secret text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create index messages_tenant_created_idx on messages(tenant_id, created_at desc);
create index whatsapp_numbers_tenant_idx on whatsapp_numbers(tenant_id);

-- Reference packages are modeled in code so pricing can evolve without a migration.
-- Initial package ladder follows Fonnte-style monthly quotas/features:
-- Free, Lite, Regular, Super, Ultra.
