import { randomUUID } from "node:crypto";
import type { MessageLog, Tenant, WaNumber } from "../types.js";

const now = () => new Date().toISOString();

export class MemoryStore {
  tenants = new Map<string, Tenant>();
  numbers = new Map<string, WaNumber>();
  messages = new Map<string, MessageLog>();

  constructor() {
    const tenant: Tenant = {
      id: "demo_tenant",
      name: "Wapi Demo",
      plan: "starter",
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
  }

  getTenantByApiKey(apiKey: string) {
    return [...this.tenants.values()].find((tenant) => tenant.apiKey === apiKey);
  }

  listTenants() {
    return [...this.tenants.values()];
  }

  getTenant(id: string) {
    return this.tenants.get(id);
  }

  createTenant(input: Pick<Tenant, "name" | "plan" | "maxNumbers" | "dailyMessageLimit" | "notificationEmail">) {
    const tenant: Tenant = {
      id: randomUUID(),
      apiKey: `wagw_${randomUUID().replaceAll("-", "")}`,
      createdAt: now(),
      ...input
    };
    this.tenants.set(tenant.id, tenant);
    return tenant;
  }

  listNumbers(tenantId: string) {
    return [...this.numbers.values()].filter((number) => number.tenantId === tenantId);
  }

  createNumber(tenantId: string, label: string) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw new Error("Tenant not found");
    if (this.listNumbers(tenantId).length >= tenant.maxNumbers) {
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

  updateNumber(id: string, patch: Partial<WaNumber>) {
    const current = this.numbers.get(id);
    if (!current) throw new Error("Number not found");
    const next = { ...current, ...patch };
    this.numbers.set(id, next);
    return next;
  }

  getNumber(tenantId: string, numberId: string) {
    const number = this.numbers.get(numberId);
    return number?.tenantId === tenantId ? number : undefined;
  }

  createMessage(input: Omit<MessageLog, "id" | "createdAt">) {
    const message: MessageLog = {
      id: randomUUID(),
      createdAt: now(),
      ...input
    };
    this.messages.set(message.id, message);
    return message;
  }

  updateMessage(id: string, patch: Partial<MessageLog>) {
    const current = this.messages.get(id);
    if (!current) throw new Error("Message not found");
    const next = { ...current, ...patch };
    this.messages.set(id, next);
    return next;
  }

  listMessages(tenantId: string) {
    return [...this.messages.values()]
      .filter((message) => message.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
