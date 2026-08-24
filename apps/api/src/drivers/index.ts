import { BaileysDriver } from "./baileysDriver.js";
import { MockWhatsAppDriver } from "./mockDriver.js";
import type { WhatsAppDriver, WhatsAppDriverEvents } from "./whatsappDriver.js";

export function createWhatsAppDriver(events?: WhatsAppDriverEvents): WhatsAppDriver {
  if (process.env.WA_DRIVER === "baileys") {
    return new BaileysDriver(process.env.SESSION_DIR ?? ".wa-sessions", events);
  }
  return new MockWhatsAppDriver();
}
