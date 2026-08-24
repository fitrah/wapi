import { mkdir } from "node:fs/promises";
import path from "node:path";
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from "@whiskeysockets/baileys";
import P from "pino";
import QRCode from "qrcode";
import type { ConnectResult, WaNumber } from "../types.js";
import type { WhatsAppDriver, WhatsAppDriverEvents } from "./whatsappDriver.js";

export class BaileysDriver implements WhatsAppDriver {
  private sockets = new Map<string, ReturnType<typeof makeWASocket>>();

  constructor(private sessionDir: string, private events: WhatsAppDriverEvents = {}) {}

  async connect(number: WaNumber): Promise<ConnectResult> {
    const dir = path.join(this.sessionDir, number.tenantId, number.id);
    await mkdir(dir, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(dir);
    const socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: P({ level: "silent" })
    });
    this.sockets.set(number.id, socket);
    socket.ev.on("creds.update", saveCreds);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ number: { ...number, status: "connecting" } });
      }, 5000);

      socket.ev.on("connection.update", async (update) => {
        if (update.qr) {
          clearTimeout(timeout);
          const nextNumber = { ...number, status: "qr" as const, lastQr: update.qr };
          await this.events.onNumberStatusChange?.(nextNumber, { reason: "qr-generated" });
          resolve({
            number: nextNumber,
            qrDataUrl: await QRCode.toDataURL(update.qr)
          });
        }
        if (update.connection === "open") {
          clearTimeout(timeout);
          const nextNumber = { ...number, status: "connected" as const, lastSeenAt: new Date().toISOString() };
          await this.events.onNumberStatusChange?.(nextNumber, { reason: "connected" });
          resolve({
            number: nextNumber
          });
        }
        if (update.connection === "close" && update.lastDisconnect?.error) {
          const code = (update.lastDisconnect.error as { output?: { statusCode?: number } }).output?.statusCode;
          const status: WaNumber["status"] = code === DisconnectReason.loggedOut ? "disconnected" : "error";
          const reconnectRequired = code === DisconnectReason.loggedOut;
          const nextNumber = { ...number, status, lastSeenAt: new Date().toISOString() };
          clearTimeout(timeout);
          await this.events.onNumberStatusChange?.(nextNumber, {
            reason: `connection-close:${code ?? "unknown"}`,
            reconnectRequired
          });
          resolve({ number: nextNumber });
        }
      });
    });
  }

  async disconnect(number: WaNumber) {
    const socket = this.sockets.get(number.id);
    await socket?.logout();
    this.sockets.delete(number.id);
    return { ...number, status: "disconnected" as const, lastSeenAt: new Date().toISOString() };
  }

  async sendText(number: WaNumber, recipient: string, body: string) {
    const socket = this.sockets.get(number.id);
    if (!socket) throw new Error("WhatsApp session is not connected in this worker");
    const jid = recipient.includes("@s.whatsapp.net") ? recipient : `${recipient.replace(/\D/g, "")}@s.whatsapp.net`;
    const result = await socket.sendMessage(jid, { text: body });
    return { providerMessageId: result?.key?.id ?? `wa_${Date.now()}` };
  }
}
