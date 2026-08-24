import { Resend } from "resend";
import type { Tenant, WaNumber } from "../types.js";

const resendApiKey = process.env.RESEND_API_KEY;
const resendFrom = process.env.RESEND_FROM;
const resend = resendApiKey ? new Resend(resendApiKey) : undefined;
const lastAlertAt = new Map<string, number>();
const alertCooldownMs = Number(process.env.ALERT_COOLDOWN_MS ?? 15 * 60 * 1000);

function canSendAlert(key: string) {
  const lastSentAt = lastAlertAt.get(key);
  const now = Date.now();
  if (lastSentAt && now - lastSentAt < alertCooldownMs) return false;
  lastAlertAt.set(key, now);
  return true;
}

export async function sendReconnectRequiredEmail(input: {
  tenant: Tenant;
  number: WaNumber;
  reason: string;
}) {
  const to = input.tenant.notificationEmail ?? process.env.ALERT_EMAIL;
  if (!resend || !resendFrom || !to) {
    console.warn("Reconnect email skipped: RESEND_API_KEY, RESEND_FROM, or recipient email is missing");
    return;
  }

  const alertKey = `${input.number.id}:reconnect-required`;
  if (!canSendAlert(alertKey)) return;

  const numberName = input.number.label;
  await resend.emails.send({
    from: resendFrom,
    to,
    subject: `[WA Gateway] ${numberName} perlu scan ulang`,
    text: [
      `Nomor WhatsApp "${numberName}" terputus dan perlu dicek.`,
      "",
      `Tenant: ${input.tenant.name}`,
      `Status: ${input.number.status}`,
      `Reason: ${input.reason}`,
      "",
      "Buka dashboard, pilih nomor tersebut, lalu tekan Connect / QR untuk scan ulang."
    ].join("\n")
  });
}
