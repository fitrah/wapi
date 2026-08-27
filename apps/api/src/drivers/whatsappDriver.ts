import type { ConnectResult, MessageLog, WaNumber } from "../types.js";

export type WhatsAppDriverEvents = {
  onNumberStatusChange?: (number: WaNumber, meta?: { reason?: string; reconnectRequired?: boolean }) => void | Promise<void>;
  onInboundMessage?: (message: Omit<MessageLog, "id" | "createdAt">) => void | Promise<void>;
};

export interface WhatsAppDriver {
  connect(number: WaNumber): Promise<ConnectResult>;
  disconnect(number: WaNumber): Promise<WaNumber>;
  sendText(number: WaNumber, recipient: string, body: string): Promise<{ providerMessageId: string }>;
}
