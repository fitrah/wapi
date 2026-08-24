import { Router } from "express";
import { z } from "zod";
import { requireTenant } from "../auth.js";
import { store } from "../store/index.js";
import { whatsAppDriver } from "./numbers.js";

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

  try {
    const sent = await whatsAppDriver.sendText(number, parsed.data.recipient, parsed.data.body);
    const updated = await store.updateMessage(message.id, {
      status: "sent",
      sentAt: new Date().toISOString(),
      error: undefined,
      ...sent
    });
    res.status(202).json({ data: updated });
  } catch (error) {
    const updated = await store.updateMessage(message.id, {
      status: "failed",
      error: error instanceof Error ? error.message : "Failed to send message"
    });
    res.status(503).json({ data: updated });
  }
});
