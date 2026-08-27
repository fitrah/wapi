import { Router } from "express";
import { z } from "zod";
import { store } from "../store/index.js";

const registerSchema = z.object({
  tenantName: z.string().min(2),
  ownerName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  notificationEmail: z.string().email().optional(),
  plan: z.string().default("free")
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const updatePackageSchema = z.object({
  plan: z.string().min(1)
});

export const authRouter = Router();

function isPlatformAdminEmail(email: string) {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "fitrahajah@gmail.com")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const result = await store.createTenantAccount(parsed.data);
    res.status(201).json({ data: result });
  } catch (error) {
    res.status(422).json({ error: error instanceof Error ? error.message : "Cannot register tenant" });
  }
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const result = await store.login(parsed.data);
  if (!result) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  res.json({ data: result });
});

authRouter.get("/me", async (req, res) => {
  const token = req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    res.status(401).json({ error: "Missing session token" });
    return;
  }
  const [tenant, user] = await Promise.all([store.getTenantBySessionToken(token), store.getUserBySessionToken(token)]);
  if (!tenant || !user) {
    res.status(401).json({ error: "Invalid session token" });
    return;
  }
  res.json({ data: { tenant, user: { ...user, isPlatformAdmin: isPlatformAdminEmail(user.email) } } });
});

authRouter.patch("/me/package", async (req, res) => {
  const token = req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    res.status(401).json({ error: "Missing session token" });
    return;
  }

  const parsed = updatePackageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const [tenant, user, plans] = await Promise.all([
    store.getTenantBySessionToken(token),
    store.getUserBySessionToken(token),
    store.listPlans()
  ]);
  if (!tenant || !user) {
    res.status(401).json({ error: "Invalid session token" });
    return;
  }
  if (user.role === "agent") {
    res.status(403).json({ error: "Only owner or admin can update package" });
    return;
  }

  const plan = plans.find((item) => item.slug === parsed.data.plan);
  if (!plan) {
    res.status(404).json({ error: "Package not found" });
    return;
  }

  const numbers = await store.listNumbers(tenant.id);
  if (numbers.length > plan.maxNumbers) {
    res.status(422).json({ error: `Cannot switch to ${plan.name}: current account has ${numbers.length} numbers, package allows ${plan.maxNumbers}` });
    return;
  }

  const updated = await store.updateTenantPackage(tenant.id, plan.slug);
  res.json({ data: { tenant: updated, plan } });
});

authRouter.post("/me/api-key", async (req, res) => {
  const token = req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    res.status(401).json({ error: "Missing session token" });
    return;
  }

  const [tenant, user] = await Promise.all([store.getTenantBySessionToken(token), store.getUserBySessionToken(token)]);
  if (!tenant || !user) {
    res.status(401).json({ error: "Invalid session token" });
    return;
  }
  if (user.role === "agent") {
    res.status(403).json({ error: "Only owner or admin can generate API key" });
    return;
  }

  const updated = await store.rotateTenantApiKey(tenant.id);
  res.json({ data: { apiKey: updated.apiKey } });
});
