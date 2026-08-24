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

export const authRouter = Router();

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
  res.json({ data: { tenant, user } });
});
