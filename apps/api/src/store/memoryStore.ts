import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "../auth/password.js";
import type { MessageLog, Plan, Session, Tenant, User, WaNumber } from "../types.js";
import type { Store } from "./store.js";

const now = () => new Date().toISOString();

export class MemoryStore implements Store {
  tenants = new Map<string, Tenant>();
  users = new Map<string, User & { passwordHash: string }>();
  sessions = new Map<string, Session>();
  numbers = new Map<string, WaNumber>();
  messages = new Map<string, MessageLog>();
  plans: Plan[] = [
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
      features: ["Text message", "Schedule", "Recurring", "Template", "Webhook", "API"]
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
      features: ["Text message", "Schedule", "Recurring", "Template", "Webhook", "API", "Remove watermark"]
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
      features: ["Text message", "Schedule", "Recurring", "Template", "Webhook", "API", "Autoreply spreadsheet"]
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
      features: ["All text features", "Attachment", "Autoreply spreadsheet", "Device notification"]
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
      features: ["Unlimited messages", "Attachment", "Autoreply spreadsheet", "Device notification"]
    }
  ];

  constructor() {
    const tenant: Tenant = {
      id: "demo_tenant",
      name: "Wapi Demo",
      plan: "free",
      maxNumbers: 3,
      dailyMessageLimit: 500,
      notificationEmail: process.env.ALERT_EMAIL,
      apiKey: "demo_key",
      createdAt: now()
    };
    const number: WaNumber = {
      id: "demo_number",
      tenantId: tenant.id,
      label: "Customer Care",
      phone: "6281234567890",
      status: "disconnected",
      createdAt: now()
    };
    this.tenants.set(tenant.id, tenant);
    this.numbers.set(number.id, number);
    hashPassword(process.env.SEED_DEMO_PASSWORD ?? "demo12345")
      .then((passwordHash) => {
        const user: User & { passwordHash: string } = {
          id: "demo_user",
          tenantId: tenant.id,
          email: "demo@wapi.local",
          name: "Demo Owner",
          role: "owner",
          createdAt: now(),
          passwordHash
        };
        this.users.set(user.email, user);
      })
      .catch((error) => console.error("Cannot seed demo user", error));
  }

  async getTenantByApiKey(apiKey: string) {
    return [...this.tenants.values()].find((tenant) => tenant.apiKey === apiKey);
  }

  async listTenants() {
    return [...this.tenants.values()];
  }

  async getTenant(id: string) {
    return this.tenants.get(id);
  }

  async createTenant(input: Pick<Tenant, "name" | "plan" | "maxNumbers" | "dailyMessageLimit" | "notificationEmail">) {
    const tenant: Tenant = {
      id: randomUUID(),
      apiKey: `wagw_${randomUUID().replaceAll("-", "")}`,
      createdAt: now(),
      ...input
    };
    this.tenants.set(tenant.id, tenant);
    return tenant;
  }

  async createTenantAccount(input: {
    tenantName: string;
    ownerName: string;
    email: string;
    password: string;
    notificationEmail?: string;
    plan?: string;
  }) {
    const plan = this.plans.find((item) => item.slug === (input.plan ?? "free")) ?? this.plans[0]!;
    const tenant = await this.createTenant({
      name: input.tenantName,
      plan: plan.slug,
      maxNumbers: plan.maxNumbers,
      dailyMessageLimit: plan.monthlyMessageLimit ?? 0,
      notificationEmail: input.notificationEmail ?? input.email
    });
    const user: User & { passwordHash: string } = {
      id: randomUUID(),
      tenantId: tenant.id,
      email: input.email.toLowerCase(),
      name: input.ownerName,
      role: "owner",
      createdAt: now(),
      passwordHash: await hashPassword(input.password)
    };
    this.users.set(user.email, user);
    const session = this.createSession(tenant.id, user.id);
    return { tenant, user, session };
  }

  async login(input: { email: string; password: string }) {
    const user = this.users.get(input.email.toLowerCase());
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) return undefined;
    const tenant = await this.getTenant(user.tenantId);
    if (!tenant) return undefined;
    return { tenant, user, session: this.createSession(tenant.id, user.id) };
  }

  async getTenantBySessionToken(token: string) {
    const session = [...this.sessions.values()].find((item) => item.token === token && item.expiresAt > now());
    return session ? this.getTenant(session.tenantId) : undefined;
  }

  async getUserBySessionToken(token: string) {
    const session = [...this.sessions.values()].find((item) => item.token === token && item.expiresAt > now());
    if (!session) return undefined;
    return [...this.users.values()].find((user) => user.id === session.userId);
  }

  private createSession(tenantId: string, userId: string): Session {
    const session: Session = {
      id: randomUUID(),
      tenantId,
      userId,
      token: `sess_${randomUUID().replaceAll("-", "")}`,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now()
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async listPlans() {
    return this.plans;
  }

  async listNumbers(tenantId: string) {
    return [...this.numbers.values()].filter((number) => number.tenantId === tenantId);
  }

  async createNumber(tenantId: string, label: string) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw new Error("Tenant not found");
    if ((await this.listNumbers(tenantId)).length >= tenant.maxNumbers) {
      throw new Error("Number limit reached for current plan");
    }

    const number: WaNumber = {
      id: randomUUID(),
      tenantId,
      label,
      status: "disconnected",
      createdAt: now()
    };
    this.numbers.set(number.id, number);
    return number;
  }

  async updateNumber(id: string, patch: Partial<WaNumber>) {
    const current = this.numbers.get(id);
    if (!current) throw new Error("Number not found");
    const next = { ...current, ...patch };
    this.numbers.set(id, next);
    return next;
  }

  async getNumber(tenantId: string, numberId: string) {
    const number = this.numbers.get(numberId);
    return number?.tenantId === tenantId ? number : undefined;
  }

  async createMessage(input: Omit<MessageLog, "id" | "createdAt">) {
    const message: MessageLog = {
      id: randomUUID(),
      createdAt: now(),
      ...input
    };
    this.messages.set(message.id, message);
    return message;
  }

  async updateMessage(id: string, patch: Partial<MessageLog>) {
    const current = this.messages.get(id);
    if (!current) throw new Error("Message not found");
    const next = { ...current, ...patch };
    this.messages.set(id, next);
    return next;
  }

  async listMessages(tenantId: string) {
    return [...this.messages.values()]
      .filter((message) => message.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listQueuedOutboundMessages(limit: number) {
    return [...this.messages.values()]
      .filter((message) => message.direction === "outbound" && message.status === "queued")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit);
  }

  async countOutboundMessagesThisMonth(tenantId: string) {
    const month = now().slice(0, 7);
    return [...this.messages.values()].filter(
      (message) => message.tenantId === tenantId && message.direction === "outbound" && message.createdAt.startsWith(month)
    ).length;
  }
}
