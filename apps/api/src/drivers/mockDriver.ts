import QRCode from "qrcode";
import type { ConnectResult, WaNumber } from "../types.js";
import type { WhatsAppDriver } from "./whatsappDriver.js";

export class MockWhatsAppDriver implements WhatsAppDriver {
  async connect(number: WaNumber): Promise<ConnectResult> {
    const payload = `wa-gateway-demo:${number.tenantId}:${number.id}:${Date.now()}`;
    const qrDataUrl = await QRCode.toDataURL(payload);
    return {
      number: {
        ...number,
        status: "qr",
        lastQr: payload,
        lastSeenAt: new Date().toISOString()
      },
      qrDataUrl
    };
  }

  async disconnect(number: WaNumber) {
    return {
      ...number,
      status: "disconnected" as const,
      lastSeenAt: new Date().toISOString()
    };
  }

  async sendText() {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return { providerMessageId: `mock_${Date.now()}` };
  }
}
