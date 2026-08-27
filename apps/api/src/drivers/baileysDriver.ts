import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import makeWASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState, type WAMessage, type WASocket } from "@whiskeysockets/baileys";
import P from "pino";
import QRCode from "qrcode";
import type { ConnectResult, WaNumber } from "../types.js";
import type { WhatsAppDriver, WhatsAppDriverEvents } from "./whatsappDriver.js";

export class BaileysDriver implements WhatsAppDriver {
  private sockets = new Map<string, WASocket>();
  private socketRuns = new Map<string, symbol>();

  constructor(private sessionDir: string, private events: WhatsAppDriverEvents = {}) {}

  private getSessionPath(number: WaNumber) {
    return path.join(this.sessionDir, number.tenantId, number.id);
  }

  private getPhoneFromSocket(socket: WASocket, fallback?: string) {
    const id = socket.user?.id;
    const phone = id?.split("@")[0]?.split(":")[0]?.replace(/\D/g, "");
    return phone || fallback;
  }

  private getPhoneFromJid(jid?: string | null) {
    return jid?.split("@")[0]?.split(":")[0]?.replace(/\D/g, "");
  }

  private getMessageBody(message: WAMessage) {
    const content = message.message?.ephemeralMessage?.message ?? message.message?.viewOnceMessage?.message ?? message.message;
    const body =
      content?.conversation ??
      content?.extendedTextMessage?.text ??
      content?.imageMessage?.caption ??
      content?.videoMessage?.caption ??
      content?.documentMessage?.caption ??
      content?.buttonsResponseMessage?.selectedDisplayText ??
      content?.listResponseMessage?.title ??
      content?.templateButtonReplyMessage?.selectedDisplayText;
    return body?.trim() || "[non-text message]";
  }

  async connect(number: WaNumber): Promise<ConnectResult> {
    const dir = this.getSessionPath(number);
    if (number.status === "error") {
      await rm(dir, { recursive: true, force: true });
    }
    await mkdir(dir, { recursive: true });
    const runId = Symbol(number.id);
    this.socketRuns.set(number.id, runId);
    this.sockets.get(number.id)?.end(new Error("Replaced by a new connect request"));

    return new Promise((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled || this.socketRuns.get(number.id) !== runId) return;
        settled = true;
        resolve({ number: { ...number, status: "connecting" } });
      }, 5000);

      const settle = (result: ConnectResult) => {
        if (settled || this.socketRuns.get(number.id) !== runId) return;
        settled = true;
        resolve(result);
      };

      const startSocket = async () => {
        if (this.socketRuns.get(number.id) !== runId) return;
        const { state, saveCreds } = await useMultiFileAuthState(dir);
        const { version } = await fetchLatestBaileysVersion();
        const socket = makeWASocket({
          auth: state,
          browser: Browsers.ubuntu("Chrome"),
          markOnlineOnConnect: false,
          printQRInTerminal: false,
          syncFullHistory: false,
          version,
          logger: P({ level: process.env.WA_LOG_LEVEL ?? "warn" })
        });
        this.sockets.set(number.id, socket);
        socket.ev.on("creds.update", saveCreds);

        socket.ev.on("messages.upsert", async (update) => {
          if (this.socketRuns.get(number.id) !== runId || update.type !== "notify") return;
          for (const message of update.messages) {
            if (message.key.fromMe || !message.key.remoteJid) continue;
            const sender = this.getPhoneFromJid(message.key.participant ?? message.key.remoteJid);
            await this.events.onInboundMessage?.({
              tenantId: number.tenantId,
              numberId: number.id,
              direction: "inbound",
              sender,
              recipient: number.phone,
              body: this.getMessageBody(message),
              status: "received",
              providerMessageId: message.key.id ?? undefined
            });
          }
        });

        socket.ev.on("connection.update", async (update) => {
          if (this.socketRuns.get(number.id) !== runId) return;
          if (update.qr) {
            clearTimeout(timeout);
            const nextNumber = { ...number, status: "qr" as const, lastQr: update.qr };
            await this.events.onNumberStatusChange?.(nextNumber, { reason: "qr-generated" });
            settle({
              number: nextNumber,
              qrDataUrl: await QRCode.toDataURL(update.qr)
            });
          }
          if (update.connection === "open") {
            clearTimeout(timeout);
            const nextNumber = {
              ...number,
              phone: this.getPhoneFromSocket(socket, number.phone),
              status: "connected" as const,
              lastSeenAt: new Date().toISOString()
            };
            await this.events.onNumberStatusChange?.(nextNumber, { reason: "connected" });
            settle({
              number: nextNumber
            });
          }
          if (update.connection === "close" && update.lastDisconnect?.error) {
            const code = (update.lastDisconnect.error as { output?: { statusCode?: number } }).output?.statusCode;
            this.sockets.delete(number.id);
            console.warn("WhatsApp connection closed", {
              numberId: number.id,
              tenantId: number.tenantId,
              code,
              message: update.lastDisconnect.error.message
            });

            if (code === DisconnectReason.restartRequired) {
              const nextNumber = {
                ...number,
                phone: this.getPhoneFromSocket(socket, number.phone),
                status: "connecting" as const,
                lastSeenAt: new Date().toISOString()
              };
              await this.events.onNumberStatusChange?.(nextNumber, { reason: "connection-restart-required" });
              setTimeout(() => {
                startSocket().catch((error) => console.error("WhatsApp restart failed", error));
              }, 250);
              return;
            }

            if (code === DisconnectReason.connectionReplaced) {
              return;
            }

            const badSession =
              code === DisconnectReason.loggedOut ||
              code === DisconnectReason.badSession ||
              code === DisconnectReason.forbidden ||
              code === DisconnectReason.multideviceMismatch;
            const timedOut = code === DisconnectReason.timedOut;
            if (badSession || timedOut) {
              await rm(dir, { recursive: true, force: true });
            }
            const status: WaNumber["status"] = badSession || timedOut ? "disconnected" : "error";
            const nextNumber = { ...number, status, lastSeenAt: new Date().toISOString() };
            clearTimeout(timeout);
            await this.events.onNumberStatusChange?.(nextNumber, {
              reason: `connection-close:${code ?? "unknown"}`,
              reconnectRequired: badSession
            });
            settle({ number: nextNumber });
          }
        });
      };

      startSocket().catch((error) => {
        clearTimeout(timeout);
        console.error("WhatsApp connect failed", error);
        settle({ number: { ...number, status: "error" as const, lastSeenAt: new Date().toISOString() } });
      });
    });
  }

  async disconnect(number: WaNumber) {
    const socket = this.sockets.get(number.id);
    await socket?.logout();
    this.sockets.delete(number.id);
    this.socketRuns.delete(number.id);
    await rm(this.getSessionPath(number), { recursive: true, force: true });
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
