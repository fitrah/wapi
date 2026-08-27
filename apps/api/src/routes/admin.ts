import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { store } from "../store/index.js";

const createTenantSchema = z.object({
  name: z.string().min(2),
  plan: z.string().default("free"),
  maxNumbers: z.number().int().positive().default(1),
  dailyMessageLimit: z.number().int().positive().default(1000),
  notificationEmail: z.string().email().optional()
});

const updatePlanSchema = z.object({
  name: z.string().min(2).optional(),
  monthlyPriceIdr: z.number().int().min(0).optional(),
  monthlyMessageLimit: z.number().int().positive().nullable().optional(),
  maxNumbers: z.number().int().positive().optional(),
  maxAgents: z.number().int().min(0).optional(),
  attachmentEnabled: z.boolean().optional(),
  autoreplySpreadsheetEnabled: z.boolean().optional(),
  deviceNotificationEnabled: z.boolean().optional(),
  logRetentionDays: z.number().int().positive().max(3650).optional(),
  logRetentionExtendable: z.boolean().optional()
});

export const adminRouter = Router();

function isPlatformAdminEmail(email: string) {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "fitrahajah@gmail.com")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

async function requirePlatformAdmin(req: Request, res: Response) {
  const token = req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    res.status(401).json({ error: "Missing session token" });
    return false;
  }
  const user = await store.getUserBySessionToken(token);
  if (!user || !isPlatformAdminEmail(user.email)) {
    res.status(403).json({ error: "Platform admin access required" });
    return false;
  }
  return true;
}

adminRouter.get("/tenants", async (_req, res) => {
  res.json({ data: await store.listTenants() });
});

adminRouter.get("/plans", async (_req, res) => {
  res.json({ data: await store.listPlans() });
});

adminRouter.patch("/plans/:slug", async (req, res) => {
  if (!(await requirePlatformAdmin(req, res))) return;
  const parsed = updatePlanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    res.json({ data: await store.updatePlan(req.params.slug, parsed.data) });
  } catch (error) {
    res.status(422).json({ error: error instanceof Error ? error.message : "Cannot update package" });
  }
});

adminRouter.post("/tenants", async (req, res) => {
  const parsed = createTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  res.status(201).json({ data: await store.createTenant(parsed.data) });
});
