import { whatsAppDriver } from "../routes/numbers.js";
import { store } from "../store/index.js";
import type { MessageLog } from "../types.js";

const batchSize = Number(process.env.MESSAGE_WORKER_BATCH_SIZE ?? 5);
const intervalMs = Number(process.env.MESSAGE_WORKER_INTERVAL_MS ?? 5000);
const sendDelayMs = Number(process.env.MESSAGE_SEND_DELAY_MS ?? 2000);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function processMessage(message: MessageLog) {
  const number = await store.getNumber(message.tenantId, message.numberId);
  if (!number) {
    await store.updateMessage(message.id, { status: "failed", error: "WhatsApp number not found" });
    return;
  }
  if (number.status !== "connected") {
    await store.updateMessage(message.id, { status: "failed", error: `WhatsApp number is ${number.status}` });
    return;
  }
  if (!message.recipient) {
    await store.updateMessage(message.id, { status: "failed", error: "Recipient is missing" });
    return;
  }

  try {
    const sent = await whatsAppDriver.sendText(number, message.recipient, message.body);
    await store.updateMessage(message.id, {
      status: "sent",
      sentAt: new Date().toISOString(),
      error: undefined,
      ...sent
    });
  } catch (error) {
    await store.updateMessage(message.id, {
      status: "failed",
      error: error instanceof Error ? error.message : "Failed to send message"
    });
  }
}

export function startMessageWorker() {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const messages = await store.listQueuedOutboundMessages(batchSize);
      for (const message of messages) {
        await processMessage(message);
        await sleep(sendDelayMs);
      }
    } catch (error) {
      console.error("Message worker failed", error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    tick().catch((error) => console.error("Message worker tick failed", error));
  }, intervalMs);
  timer.unref();
  tick().catch((error) => console.error("Initial message worker tick failed", error));
}
