import { Router } from "express";
import { z } from "zod";
import { store } from "../store/index.js";

const createTenantSchema = z.object({
  name: z.string().min(2),
  plan: z.string().default("starter"),
  maxNumbers: z.number().int().positive().default(1),
  dailyMessageLimit: z.number().int().positive().default(500),
  notificationEmail: z.string().email().optional()
});

export const adminRouter = Router();

adminRouter.get("/tenants", (_req, res) => {
  res.json({ data: store.listTenants() });
});

adminRouter.post("/tenants", (req, res) => {
  const parsed = createTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  res.status(201).json({ data: store.createTenant(parsed.data) });
});
