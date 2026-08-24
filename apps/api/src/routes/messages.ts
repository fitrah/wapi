import { Router } from "express";
import { z } from "zod";
import { requireTenant } from "../auth.js";
import { store } from "../store/index.js";

const sendSchema = z.object({
  numberId: z.string().min(1),
  recipient: z.string().min(8),
  body: z.string().min(1).max(4096)
});

export const messagesRouter = Router();
messagesRouter.use(requireTenant);

messagesRouter.get("/", async (req, res) => {
  res.json({ data: await store.listMessages(req.tenant!.id) });
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
