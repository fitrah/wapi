export type Tenant = {
  id: string;
  name: string;
  plan: string;
  maxNumbers: number;
  dailyMessageLimit: number;
  notificationEmail?: string;
  apiKey: string;
  createdAt: string;
};

export type WaNumber = {
  id: string;
  tenantId: string;
  label: string;
  phone?: string;
  status: "connected" | "connecting" | "disconnected" | "qr" | "error";
  lastQr?: string;
  lastSeenAt?: string;
  createdAt: string;
};

export type MessageLog = {
  id: string;
  tenantId: string;
  numberId: string;
  direction: "inbound" | "outbound";
  recipient?: string;
  sender?: string;
  body: string;
  status: "queued" | "sent" | "failed" | "received";
  error?: string;
  createdAt: string;
  sentAt?: string;
};

export type ConnectResult = {
  number: WaNumber;
  qrDataUrl?: string;
};
