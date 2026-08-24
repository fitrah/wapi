import { Router } from "express";
import { z } from "zod";
import { requireTenant } from "../auth.js";
import { createWhatsAppDriver } from "../drivers/index.js";
import { sendReconnectRequiredEmail } from "../services/email.js";
import { store } from "../store/index.js";

const createNumberSchema = z.object({
  label: z.string().min(2)
});

export const numbersRouter = Router();
const driver = createWhatsAppDriver({
  async onNumberStatusChange(number, meta) {
    const updated = store.updateNumber(number.id, number);
    if (!meta?.reconnectRequired) return;

    const tenant = store.getTenant(updated.tenantId);
    if (!tenant) return;
    await sendReconnectRequiredEmail({
      tenant,
      number: updated,
      reason: meta.reason ?? "session-disconnected"
    });
  }
});

numbersRouter.use(requireTenant);

numbersRouter.get("/", (req, res) => {
  res.json({ data: store.listNumbers(req.tenant!.id) });
});

numbersRouter.post("/", (req, res) => {
  const parsed = createNumberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    res.status(201).json({ data: store.createNumber(req.tenant!.id, parsed.data.label) });
  } catch (error) {
    res.status(422).json({ error: error instanceof Error ? error.message : "Cannot create number" });
  }
});

numbersRouter.post("/:id/connect", async (req, res) => {
  const number = store.getNumber(req.tenant!.id, req.params.id);
  if (!number) {
    res.status(404).json({ error: "Number not found" });
    return;
  }
  const result = await driver.connect(number);
  const updated = store.updateNumber(number.id, result.number);
  res.json({ data: updated, qrDataUrl: result.qrDataUrl });
});

numbersRouter.post("/:id/disconnect", async (req, res) => {
  const number = store.getNumber(req.tenant!.id, req.params.id);
  if (!number) {
    res.status(404).json({ error: "Number not found" });
    return;
  }
  const updated = store.updateNumber(number.id, await driver.disconnect(number));
  res.json({ data: updated });
});

export { driver as whatsAppDriver };
