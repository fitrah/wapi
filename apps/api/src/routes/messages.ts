import { Router } from "express";
import { z } from "zod";
import { requireTenant } from "../auth.js";
import { store } from "../store/index.js";

const sendSchema = z.object({
  numberId: z.string().min(1),
  recipient: z.string().min(8),
  body: z.string().min(1).max(4096)
});

const listQuerySchema = z.object({
  direction: z.enum(["all", "inbound", "outbound"]).default("all"),
  status: z.enum(["all", "queued", "sent", "failed", "received"]).default("all"),
  numberId: z.string().optional(),
  q: z.string().optional()
});

export const messagesRouter = Router();
messagesRouter.use(requireTenant);

messagesRouter.get("/", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const query = parsed.data;
  const search = query.q?.trim().toLowerCase();
  const messages = (await store.listMessages(req.tenant!.id)).filter((message) => {
    if (query.direction !== "all" && message.direction !== query.direction) return false;
    if (query.status !== "all" && message.status !== query.status) return false;
    if (query.numberId && message.numberId !== query.numberId) return false;
    if (!search) return true;
    return [message.sender, message.recipient, message.body, message.error].some((value) => value?.toLowerCase().includes(search));
  });
  res.json({ data: messages });
});

messagesRouter.post("/retention/extend", async (req, res) => {
  const plan = (await store.listPlans()).find((item) => item.slug === req.tenant!.plan);
  if (!plan?.logRetentionExtendable) {
    res.status(403).json({ error: "Manual log extension is not enabled for current package" });
    return;
  }

  const result = await store.extendMessageRetention(req.tenant!.id, plan.logRetentionDays);
  res.json({ data: result });
});

messagesRouter.post("/send-text", async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const number = await store.getNumber(req.tenant!.id, parsed.data.numberId);
  if (!number) {
    res.status(404).json({ error: "Number not found" });
    return;
  }

  const sentThisMonth = await store.countOutboundMessagesThisMonth(req.tenant!.id);
  if (req.tenant!.dailyMessageLimit > 0 && sentThisMonth >= req.tenant!.dailyMessageLimit) {
    res.status(429).json({ error: "Monthly message limit reached for current plan" });
    return;
  }

  const message = await store.createMessage({
    tenantId: req.tenant!.id,
    numberId: number.id,
    direction: "outbound",
    recipient: parsed.data.recipient,
    body: parsed.data.body,
    status: "queued"
  });

  res.status(202).json({ data: message });
});
