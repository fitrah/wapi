import type { MessageLog, Plan, Session, Tenant, User, WaNumber } from "../types.js";

export interface Store {
  init?(): Promise<void>;
  getTenantByApiKey(apiKey: string): Promise<Tenant | undefined>;
  getTenant(id: string): Promise<Tenant | undefined>;
  listTenants(): Promise<Tenant[]>;
  createTenant(input: Pick<Tenant, "name" | "plan" | "maxNumbers" | "dailyMessageLimit" | "notificationEmail">): Promise<Tenant>;
  updateTenantPackage(tenantId: string, planSlug: string): Promise<Tenant>;
  createTenantAccount(input: {
    tenantName: string;
    ownerName: string;
    email: string;
    password: string;
    notificationEmail?: string;
    plan?: string;
  }): Promise<{ tenant: Tenant; user: User; session: Session }>;
  login(input: { email: string; password: string }): Promise<{ tenant: Tenant; user: User; session: Session } | undefined>;
  getTenantBySessionToken(token: string): Promise<Tenant | undefined>;
  getUserBySessionToken(token: string): Promise<User | undefined>;
  listPlans(): Promise<Plan[]>;
  listNumbers(tenantId: string): Promise<WaNumber[]>;
  createNumber(tenantId: string, label: string): Promise<WaNumber>;
  updateNumber(id: string, patch: Partial<WaNumber>): Promise<WaNumber>;
  getNumber(tenantId: string, numberId: string): Promise<WaNumber | undefined>;
  createMessage(input: Omit<MessageLog, "id" | "createdAt">): Promise<MessageLog>;
  updateMessage(id: string, patch: Partial<MessageLog>): Promise<MessageLog>;
  listMessages(tenantId: string): Promise<MessageLog[]>;
  listQueuedOutboundMessages(limit: number): Promise<MessageLog[]>;
  countOutboundMessagesThisMonth(tenantId: string): Promise<number>;
}
