import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { hashPassword, verifyPassword } from "../auth/password.js";
import type { MessageLog, Plan, Session, Tenant, User, WaNumber } from "../types.js";
import type { CreateMessageInput, Store, UpdatePlanInput } from "./store.js";

const { Pool } = pg;
const now = () => new Date().toISOString();
const hashApiKey = (apiKey: string) => createHash("sha256").update(apiKey).digest("hex");

const plans: Plan[] = [
  {
    slug: "free",
    name: "Free",
    monthlyPriceIdr: 0,
    monthlyMessageLimit: 1000,
    maxNumbers: 1,
    maxAgents: 0,
    attachmentEnabled: false,
    autoreplySpreadsheetEnabled: false,
    deviceNotificationEnabled: false,
    logRetentionDays: 30,
    logRetentionExtendable: false,
    features: ["Kirim personal", "Kirim group", "Pesan text", "Pesan schedule", "Pesan recurring", "Pesan template", "Webhook", "API"]
  },
  {
    slug: "lite",
    name: "Lite",
    monthlyPriceIdr: 25000,
    monthlyMessageLimit: 1000,
    maxNumbers: 1,
    maxAgents: 0,
    attachmentEnabled: false,
    autoreplySpreadsheetEnabled: false,
    deviceNotificationEnabled: true,
    logRetentionDays: 30,
    logRetentionExtendable: false,
    features: ["Free features", "Remove watermark", "Device notification"]
  },
  {
    slug: "regular",
    name: "Regular",
    monthlyPriceIdr: 66000,
    monthlyMessageLimit: 10000,
    maxNumbers: 1,
    maxAgents: 2,
    attachmentEnabled: false,
    autoreplySpreadsheetEnabled: true,
    deviceNotificationEnabled: true,
    logRetentionDays: 30,
    logRetentionExtendable: false,
    features: ["Lite features", "Autoreply spreadsheet", "2 agents"]
  },
  {
    slug: "super",
    name: "Super",
    monthlyPriceIdr: 165000,
    monthlyMessageLimit: 10000,
    maxNumbers: 2,
    maxAgents: 2,
    attachmentEnabled: true,
    autoreplySpreadsheetEnabled: true,
    deviceNotificationEnabled: true,
    logRetentionDays: 30,
    logRetentionExtendable: true,
    features: ["Regular features", "Pesan attachment", "2 devices"]
  },
  {
    slug: "ultra",
    name: "Ultra",
    monthlyPriceIdr: 355000,
    monthlyMessageLimit: null,
    maxNumbers: 4,
    maxAgents: 4,
    attachmentEnabled: true,
    autoreplySpreadsheetEnabled: true,
    deviceNotificationEnabled: true,
    logRetentionDays: 30,
    logRetentionExtendable: true,
    features: ["All features", "Unlimited messages", "4 devices", "4 agents"]
  }
];

function mapTenant(row: Record<string, unknown>, apiKey = ""): Tenant {
  return {
    id: String(row.id),
    name: String(row.name),
    plan: String(row.plan),
    maxNumbers: Number(row.max_numbers),
    dailyMessageLimit: Number(row.daily_message_limit),
    notificationEmail: row.notification_email ? String(row.notification_email) : undefined,
    apiKey,
    createdAt: new Date(String(row.created_at)).toISOString()
  };
}

function mapNumber(row: Record<string, unknown>): WaNumber {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    label: String(row.label),
    phone: row.phone ? String(row.phone) : undefined,
    status: row.status as WaNumber["status"],
    lastQr: row.last_qr ? String(row.last_qr) : undefined,
    lastSeenAt: row.last_seen_at ? new Date(String(row.last_seen_at)).toISOString() : undefined,
    createdAt: new Date(String(row.created_at)).toISOString()
  };
}

function mapMessage(row: Record<string, unknown>): MessageLog {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    numberId: String(row.number_id),
    direction: row.direction as MessageLog["direction"],
    recipient: row.recipient ? String(row.recipient) : undefined,
    sender: row.sender ? String(row.sender) : undefined,
    body: String(row.body),
    status: row.status as MessageLog["status"],
    providerMessageId: row.provider_message_id ? String(row.provider_message_id) : undefined,
    error: row.error ? String(row.error) : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
    sentAt: row.sent_at ? new Date(String(row.sent_at)).toISOString() : undefined,
    expiresAt: row.expires_at ? new Date(String(row.expires_at)).toISOString() : undefined
  };
}

function mapUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    email: String(row.email),
    name: String(row.name),
    role: row.role as User["role"],
    createdAt: new Date(String(row.created_at)).toISOString()
  };
}

function mapSession(row: Record<string, unknown>, token: string): Session {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    token,
    expiresAt: new Date(String(row.expires_at)).toISOString(),
    createdAt: new Date(String(row.created_at)).toISOString()
  };
}

function mapPlan(row: Record<string, unknown>, fallback: Plan): Plan {
  return {
    ...fallback,
    name: String(row.name),
    monthlyPriceIdr: Number(row.monthly_price_idr),
    monthlyMessageLimit: row.monthly_message_limit === null ? null : Number(row.monthly_message_limit),
    maxNumbers: Number(row.max_numbers),
    maxAgents: Number(row.max_agents),
    attachmentEnabled: Boolean(row.attachment_enabled),
    autoreplySpreadsheetEnabled: Boolean(row.autoreply_spreadsheet_enabled),
    deviceNotificationEnabled: Boolean(row.device_notification_enabled),
    logRetentionDays: Number(row.log_retention_days),
    logRetentionExtendable: Boolean(row.log_retention_extendable)
  };
}

export class PostgresStore implements Store {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async init() {
    await this.pool.query(`
      create table if not exists tenants (
        id uuid primary key,
        name text not null,
        plan text not null default 'free',
        max_numbers integer not null default 1,
        daily_message_limit integer not null default 1000,
        notification_email text,
        api_key_hash text not null unique,
        created_at timestamptz not null default now()
      );

      create table if not exists whatsapp_numbers (
        id uuid primary key,
        tenant_id uuid not null references tenants(id) on delete cascade,
        label text not null,
        phone text,
        status text not null default 'disconnected',
        last_qr text,
        last_seen_at timestamptz,
        created_at timestamptz not null default now()
      );

      create table if not exists messages (
        id uuid primary key,
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
        sent_at timestamptz,
        expires_at timestamptz not null default (now() + interval '30 days')
      );

      create table if not exists webhooks (
        id uuid primary key,
        tenant_id uuid not null references tenants(id) on delete cascade,
        url text not null,
        secret text not null,
        enabled boolean not null default true,
        created_at timestamptz not null default now()
      );

      create table if not exists users (
        id uuid primary key,
        tenant_id uuid not null references tenants(id) on delete cascade,
        email text not null unique,
        name text not null,
        role text not null check (role in ('owner', 'admin', 'agent')),
        password_hash text not null,
        created_at timestamptz not null default now()
      );

      create table if not exists auth_sessions (
        id uuid primary key,
        tenant_id uuid not null references tenants(id) on delete cascade,
        user_id uuid not null references users(id) on delete cascade,
        token_hash text not null unique,
        expires_at timestamptz not null,
        created_at timestamptz not null default now()
      );

      create table if not exists package_settings (
        slug text primary key,
        name text not null,
        monthly_price_idr integer not null,
        monthly_message_limit integer,
        max_numbers integer not null,
        max_agents integer not null,
        attachment_enabled boolean not null,
        autoreply_spreadsheet_enabled boolean not null,
        device_notification_enabled boolean not null,
        log_retention_days integer not null,
        log_retention_extendable boolean not null,
        updated_at timestamptz not null default now()
      );

      create index if not exists messages_tenant_created_idx on messages(tenant_id, created_at desc);
      create index if not exists whatsapp_numbers_tenant_idx on whatsapp_numbers(tenant_id);
      create index if not exists users_tenant_idx on users(tenant_id);
      create index if not exists auth_sessions_token_idx on auth_sessions(token_hash);
    `);
    await this.pool.query("alter table messages add column if not exists expires_at timestamptz");
    await this.pool.query("update messages set expires_at = created_at + interval '30 days' where expires_at is null");
    await this.pool.query("alter table messages alter column expires_at set not null");
    await this.pool.query("alter table messages alter column expires_at set default (now() + interval '30 days')");
    await this.pool.query("create index if not exists messages_expires_at_idx on messages(expires_at)");

    await this.seedDemoTenant();
  }

  async getTenantByApiKey(apiKey: string) {
    const result = await this.pool.query("select * from tenants where api_key_hash = $1", [hashApiKey(apiKey)]);
    const row = result.rows[0];
    return row ? mapTenant(row, apiKey) : undefined;
  }

  async getTenant(id: string) {
    const result = await this.pool.query("select * from tenants where id = $1", [id]);
    const row = result.rows[0];
    return row ? mapTenant(row) : undefined;
  }

  async listTenants() {
    const result = await this.pool.query("select * from tenants order by created_at desc");
    return result.rows.map((row) => mapTenant(row));
  }

  async createTenant(input: Pick<Tenant, "name" | "plan" | "maxNumbers" | "dailyMessageLimit" | "notificationEmail">) {
    const apiKey = `wapi_${randomUUID().replaceAll("-", "")}`;
    const result = await this.pool.query(
      `insert into tenants (id, name, plan, max_numbers, daily_message_limit, notification_email, api_key_hash)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning *`,
      [randomUUID(), input.name, input.plan, input.maxNumbers, input.dailyMessageLimit, input.notificationEmail ?? null, hashApiKey(apiKey)]
    );
    return mapTenant(result.rows[0], apiKey);
  }

  async updateTenantPackage(tenantId: string, planSlug: string) {
    const plan = (await this.listPlans()).find((item) => item.slug === planSlug);
    if (!plan) throw new Error("Package not found");
    const result = await this.pool.query(
      `update tenants
       set plan = $2, max_numbers = $3, daily_message_limit = $4
       where id = $1
       returning *`,
      [tenantId, plan.slug, plan.maxNumbers, plan.monthlyMessageLimit ?? 0]
    );
    if (!result.rows[0]) throw new Error("Tenant not found");
    return mapTenant(result.rows[0]);
  }

  async createTenantAccount(input: {
    tenantName: string;
    ownerName: string;
    email: string;
    password: string;
    notificationEmail?: string;
    plan?: string;
  }) {
    const normalizedEmail = input.email.toLowerCase();
    const existing = await this.pool.query("select 1 from users where email = $1", [normalizedEmail]);
    if (existing.rows[0]) throw new Error("Email already registered");

    const availablePlans = await this.listPlans();
    const plan = availablePlans.find((item) => item.slug === (input.plan ?? "free")) ?? availablePlans[0]!;
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const apiKey = `wapi_${randomUUID().replaceAll("-", "")}`;
      const tenantResult = await client.query(
        `insert into tenants (id, name, plan, max_numbers, daily_message_limit, notification_email, api_key_hash)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning *`,
        [
          randomUUID(),
          input.tenantName,
          plan.slug,
          plan.maxNumbers,
          plan.monthlyMessageLimit ?? 0,
          input.notificationEmail ?? normalizedEmail,
          hashApiKey(apiKey)
        ]
      );
      const tenant = mapTenant(tenantResult.rows[0], apiKey);
      const userResult = await client.query(
        `insert into users (id, tenant_id, email, name, role, password_hash)
         values ($1, $2, $3, $4, 'owner', $5)
         returning *`,
        [randomUUID(), tenant.id, normalizedEmail, input.ownerName, await hashPassword(input.password)]
      );
      const user = mapUser(userResult.rows[0]);
      const session = await this.createSession(user.tenantId, user.id, client);
      await client.query("commit");
      return { tenant, user, session };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async login(input: { email: string; password: string }) {
    const result = await this.pool.query("select * from users where email = $1", [input.email.toLowerCase()]);
    const row = result.rows[0];
    if (!row || !(await verifyPassword(input.password, String(row.password_hash)))) return undefined;
    const tenant = await this.getTenant(String(row.tenant_id));
    if (!tenant) return undefined;
    const user = mapUser(row);
    const session = await this.createSession(user.tenantId, user.id);
    return { tenant, user, session };
  }

  async getTenantBySessionToken(token: string) {
    const result = await this.pool.query(
      `select t.*
       from auth_sessions s
       join tenants t on t.id = s.tenant_id
       where s.token_hash = $1 and s.expires_at > now()`,
      [hashApiKey(token)]
    );
    return result.rows[0] ? mapTenant(result.rows[0]) : undefined;
  }

  async getUserBySessionToken(token: string) {
    const result = await this.pool.query(
      `select u.*
       from auth_sessions s
       join users u on u.id = s.user_id
       where s.token_hash = $1 and s.expires_at > now()`,
      [hashApiKey(token)]
    );
    return result.rows[0] ? mapUser(result.rows[0]) : undefined;
  }

  async listPlans() {
    const result = await this.pool.query("select * from package_settings");
    const overrides = new Map(result.rows.map((row) => [String(row.slug), row]));
    return plans.map((plan) => {
      const row = overrides.get(plan.slug);
      return row ? mapPlan(row, plan) : plan;
    });
  }

  async updatePlan(slug: string, input: UpdatePlanInput) {
    const current = (await this.listPlans()).find((plan) => plan.slug === slug);
    if (!current) throw new Error("Package not found");
    const next: Plan = { ...current, ...input, slug };
    await this.pool.query(
      `insert into package_settings (
         slug, name, monthly_price_idr, monthly_message_limit, max_numbers, max_agents,
         attachment_enabled, autoreply_spreadsheet_enabled, device_notification_enabled,
         log_retention_days, log_retention_extendable, updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
       on conflict (slug) do update
       set name = excluded.name,
           monthly_price_idr = excluded.monthly_price_idr,
           monthly_message_limit = excluded.monthly_message_limit,
           max_numbers = excluded.max_numbers,
           max_agents = excluded.max_agents,
           attachment_enabled = excluded.attachment_enabled,
           autoreply_spreadsheet_enabled = excluded.autoreply_spreadsheet_enabled,
           device_notification_enabled = excluded.device_notification_enabled,
           log_retention_days = excluded.log_retention_days,
           log_retention_extendable = excluded.log_retention_extendable,
           updated_at = now()`,
      [
        next.slug,
        next.name,
        next.monthlyPriceIdr,
        next.monthlyMessageLimit,
        next.maxNumbers,
        next.maxAgents,
        next.attachmentEnabled,
        next.autoreplySpreadsheetEnabled,
        next.deviceNotificationEnabled,
        next.logRetentionDays,
        next.logRetentionExtendable
      ]
    );
    await this.pool.query("update tenants set max_numbers = $2, daily_message_limit = $3 where plan = $1", [
      next.slug,
      next.maxNumbers,
      next.monthlyMessageLimit ?? 0
    ]);
    return next;
  }

  async listNumbers(tenantId: string) {
    const result = await this.pool.query("select * from whatsapp_numbers where tenant_id = $1 order by created_at desc", [tenantId]);
    return result.rows.map(mapNumber);
  }

  async createNumber(tenantId: string, label: string) {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) throw new Error("Tenant not found");
    if ((await this.listNumbers(tenantId)).length >= tenant.maxNumbers) {
      throw new Error("Number limit reached for current plan");
    }

    const result = await this.pool.query(
      `insert into whatsapp_numbers (id, tenant_id, label, status) values ($1, $2, $3, 'disconnected') returning *`,
      [randomUUID(), tenantId, label]
    );
    return mapNumber(result.rows[0]);
  }

  async updateNumber(id: string, patch: Partial<WaNumber>) {
    const current = await this.pool.query("select * from whatsapp_numbers where id = $1", [id]);
    if (!current.rows[0]) throw new Error("Number not found");
    const next = { ...mapNumber(current.rows[0]), ...patch };
    const result = await this.pool.query(
      `update whatsapp_numbers
       set label = $2, phone = $3, status = $4, last_qr = $5, last_seen_at = $6
       where id = $1
       returning *`,
      [id, next.label, next.phone ?? null, next.status, next.lastQr ?? null, next.lastSeenAt ?? null]
    );
    return mapNumber(result.rows[0]);
  }

  async getNumber(tenantId: string, numberId: string) {
    const result = await this.pool.query("select * from whatsapp_numbers where tenant_id = $1 and id = $2", [tenantId, numberId]);
    return result.rows[0] ? mapNumber(result.rows[0]) : undefined;
  }

  async createMessage(input: CreateMessageInput) {
    const expiresAt = input.expiresAt ?? new Date(Date.now() + (await this.getMessageRetentionDays(input.tenantId)) * 24 * 60 * 60 * 1000).toISOString();
    const result = await this.pool.query(
      `insert into messages (id, tenant_id, number_id, direction, recipient, sender, body, status, provider_message_id, error, sent_at, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz)
       returning *`,
      [
        randomUUID(),
        input.tenantId,
        input.numberId,
        input.direction,
        input.recipient ?? null,
        input.sender ?? null,
        input.body,
        input.status,
        input.providerMessageId ?? null,
        input.error ?? null,
        input.sentAt ?? null,
        expiresAt
      ]
    );
    return mapMessage(result.rows[0]);
  }

  async updateMessage(id: string, patch: Partial<MessageLog>) {
    const current = await this.pool.query("select * from messages where id = $1", [id]);
    if (!current.rows[0]) throw new Error("Message not found");
    const next = { ...mapMessage(current.rows[0]), ...patch };
    const result = await this.pool.query(
      `update messages
       set status = $2, provider_message_id = $3, error = $4, sent_at = $5
       where id = $1
       returning *`,
      [id, next.status, next.providerMessageId ?? null, next.error ?? null, next.sentAt ?? null]
    );
    return mapMessage(result.rows[0]);
  }

  async listMessages(tenantId: string) {
    const result = await this.pool.query("select * from messages where tenant_id = $1 and expires_at > now() order by created_at desc limit 200", [tenantId]);
    return result.rows.map(mapMessage);
  }

  async listQueuedOutboundMessages(limit: number) {
    const result = await this.pool.query(
      `select *
       from messages
       where direction = 'outbound' and status = 'queued' and expires_at > now()
       order by created_at asc
       limit $1`,
      [limit]
    );
    return result.rows.map(mapMessage);
  }

  async countOutboundMessagesThisMonth(tenantId: string) {
    const result = await this.pool.query(
      `select count(*)::int as count
       from messages
       where tenant_id = $1
         and direction = 'outbound'
         and created_at >= date_trunc('month', now())`,
      [tenantId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async deleteExpiredMessages() {
    const result = await this.pool.query("delete from messages where expires_at <= now()");
    return result.rowCount ?? 0;
  }

  async extendMessageRetention(tenantId: string, days: number) {
    const result = await this.pool.query(
      `with updated as (
         update messages
         set expires_at = greatest(expires_at, now()) + ($2 * interval '1 day')
         where tenant_id = $1 and expires_at > now()
         returning expires_at
       )
       select count(*)::int as count, max(expires_at) as expires_at from updated`,
      [tenantId, days]
    );
    return {
      count: Number(result.rows[0]?.count ?? 0),
      expiresAt: result.rows[0]?.expires_at ? new Date(String(result.rows[0].expires_at)).toISOString() : undefined
    };
  }

  private async getMessageRetentionDays(tenantId: string) {
    const tenant = await this.getTenant(tenantId);
    const plan = (await this.listPlans()).find((item) => item.slug === tenant?.plan);
    return plan?.logRetentionDays ?? 30;
  }

  private async seedDemoTenant() {
    const apiKey = process.env.SEED_DEMO_API_KEY ?? "demo_key";
    const tenantId = process.env.SEED_DEMO_TENANT_ID ?? "00000000-0000-4000-8000-000000000001";
    const numberId = process.env.SEED_DEMO_NUMBER_ID ?? "00000000-0000-4000-8000-000000000002";
    await this.pool.query(
      `insert into tenants (id, name, plan, max_numbers, daily_message_limit, notification_email, api_key_hash)
       values ($1, 'Wapi Demo', 'free', 1, 1000, $2, $3)
       on conflict (id) do nothing`,
      [tenantId, process.env.ALERT_EMAIL || null, hashApiKey(apiKey)]
    );
    await this.pool.query(
      `insert into whatsapp_numbers (id, tenant_id, label, phone, status)
       values ($1, $2, 'Customer Care', '6281234567890', 'disconnected')
       on conflict (id) do nothing`,
      [numberId, tenantId]
    );
    const password = process.env.SEED_DEMO_PASSWORD ?? "demo12345";
    await this.pool.query(
      `insert into users (id, tenant_id, email, name, role, password_hash)
       values ($1, $2, 'demo@wapi.local', 'Demo Owner', 'owner', $3)
       on conflict (email) do nothing`,
      [process.env.SEED_DEMO_USER_ID ?? "00000000-0000-4000-8000-000000000003", tenantId, await hashPassword(password)]
    );
  }

  private async createSession(tenantId: string, userId: string, client: pg.PoolClient | pg.Pool = this.pool) {
    const token = `sess_${randomUUID().replaceAll("-", "")}`;
    const result = await client.query(
      `insert into auth_sessions (id, tenant_id, user_id, token_hash, expires_at)
       values ($1, $2, $3, $4, now() + interval '30 days')
       returning *`,
      [randomUUID(), tenantId, userId, hashApiKey(token)]
    );
    return mapSession(result.rows[0], token);
  }
}
