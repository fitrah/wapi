import type { MessageLog, Plan, Tenant, WaNumber } from "../types.js";

export interface Store {
  init?(): Promise<void>;
  getTenantByApiKey(apiKey: string): Promise<Tenant | undefined>;
  getTenant(id: string): Promise<Tenant | undefined>;
  listTenants(): Promise<Tenant[]>;
  createTenant(input: Pick<Tenant, "name" | "plan" | "maxNumbers" | "dailyMessageLimit" | "notificationEmail">): Promise<Tenant>;
  listPlans(): Promise<Plan[]>;
  listNumbers(tenantId: string): Promise<WaNumber[]>;
  createNumber(tenantId: string, label: string): Promise<WaNumber>;
  updateNumber(id: string, patch: Partial<WaNumber>): Promise<WaNumber>;
  getNumber(tenantId: string, numberId: string): Promise<WaNumber | undefined>;
  createMessage(input: Omit<MessageLog, "id" | "createdAt">): Promise<MessageLog>;
  updateMessage(id: string, patch: Partial<MessageLog>): Promise<MessageLog>;
  listMessages(tenantId: string): Promise<MessageLog[]>;
  countOutboundMessagesThisMonth(tenantId: string): Promise<number>;
}
