import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, KeyRound, Link2, MessageSquareText, Plus, QrCode, RefreshCw, Send, Smartphone } from "lucide-react";
import "./styles.css";

type Tenant = {
  id: string;
  name: string;
  plan: string;
  maxNumbers: number;
  dailyMessageLimit: number;
  apiKey: string;
};

type WaNumber = {
  id: string;
  label: string;
  phone?: string;
  status: "connected" | "connecting" | "disconnected" | "qr" | "error";
  lastSeenAt?: string;
};

type MessageLog = {
  id: string;
  numberId: string;
  direction: "inbound" | "outbound";
  recipient?: string;
  body: string;
  status: "queued" | "sent" | "failed" | "received";
  error?: string;
  createdAt: string;
};

const apiBase = import.meta.env.VITE_API_BASE ?? "";
const demoKey = "demo_key";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-key": demoKey,
      ...init?.headers
    }
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json.data ?? json;
}

function App() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [numbers, setNumbers] = useState<WaNumber[]>([]);
  const [messages, setMessages] = useState<MessageLog[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [label, setLabel] = useState("");
  const [recipient, setRecipient] = useState("6281234567890");
  const [body, setBody] = useState("Halo, ini test dari Wapi.");
  const [selectedNumberId, setSelectedNumberId] = useState("demo_number");
  const [notice, setNotice] = useState("");

  const activeTenant = tenants[0];
  const selectedNumber = useMemo(
    () => numbers.find((number) => number.id === selectedNumberId) ?? numbers[0],
    [numbers, selectedNumberId]
  );

  async function refresh() {
    const [tenantRes, numberRes, messageRes] = await Promise.all([
      api<{ data: Tenant[] }>("/api/admin/tenants").then((x) => x.data ?? x),
      api<{ data: WaNumber[] }>("/api/numbers").then((x) => x.data ?? x),
      api<{ data: MessageLog[] }>("/api/messages").then((x) => x.data ?? x)
    ]);
    setTenants(tenantRes as Tenant[]);
    setNumbers(numberRes as WaNumber[]);
    setMessages(messageRes as MessageLog[]);
    if (!selectedNumberId && (numberRes as WaNumber[])[0]) setSelectedNumberId((numberRes as WaNumber[])[0].id);
  }

  useEffect(() => {
    refresh().catch((error) => setNotice(error.message));
  }, []);

  async function connect(numberId: string) {
    const result = await api<{ data: WaNumber; qrDataUrl?: string }>(`/api/numbers/${numberId}/connect`, { method: "POST" });
    setQrDataUrl(result.qrDataUrl ?? "");
    setNotice(result.qrDataUrl ? "QR siap discan." : "Session sedang connecting.");
    await refresh();
  }

  async function addNumber() {
    if (!label.trim()) return;
    await api("/api/numbers", { method: "POST", body: JSON.stringify({ label }) });
    setLabel("");
    setNotice("Nomor baru dibuat.");
    await refresh();
  }

  async function sendMessage() {
    if (!selectedNumber) return;
    await api("/api/messages/send-text", {
      method: "POST",
      body: JSON.stringify({ numberId: selectedNumber.id, recipient, body })
    });
    setNotice("Pesan masuk queue dan diproses.");
    await refresh();
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandIcon"><MessageSquareText size={20} /></div>
          <div>
            <strong>Wapi</strong>
            <span>SaaS Console</span>
          </div>
        </div>
        <nav>
          <button className="active"><Activity size={17} /> Overview</button>
          <button><Smartphone size={17} /> Numbers</button>
          <button><Send size={17} /> Messages</button>
          <button><KeyRound size={17} /> API Keys</button>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p>{activeTenant?.name ?? "Demo Tenant"}</p>
            <h1>WA API gateway for multi-number automation</h1>
          </div>
          <button onClick={() => refresh()}><RefreshCw size={16} /> Refresh</button>
        </header>

        <section className="stats">
          <div>
            <span>Plan</span>
            <strong>{activeTenant?.plan ?? "starter"}</strong>
          </div>
          <div>
            <span>Numbers</span>
            <strong>{numbers.length}/{activeTenant?.maxNumbers ?? 0}</strong>
          </div>
          <div>
            <span>Daily Limit</span>
            <strong>{activeTenant?.dailyMessageLimit ?? 0}</strong>
          </div>
          <div>
            <span>API Key</span>
            <code>{demoKey}</code>
          </div>
        </section>

        {notice && <div className="notice">{notice}</div>}

        <section className="grid">
          <div className="panel">
            <div className="panelHeader">
              <h2>Numbers</h2>
              <QrCode size={18} />
            </div>
            <div className="addRow">
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label nomor" />
              <button onClick={addNumber}><Plus size={16} /></button>
            </div>
            <div className="numberList">
              {numbers.map((number) => (
                <button
                  className={number.id === selectedNumber?.id ? "number activeNumber" : "number"}
                  key={number.id}
                  onClick={() => setSelectedNumberId(number.id)}
                >
                  <div>
                    <strong>{number.label}</strong>
                    <span>{number.phone ?? "Belum terhubung"}</span>
                  </div>
                  <em data-status={number.status}>{number.status}</em>
                </button>
              ))}
            </div>
            {selectedNumber && (
              <button className="wide" onClick={() => connect(selectedNumber.id)}>
                <Link2 size={16} /> Connect / QR
              </button>
            )}
            {qrDataUrl && <img className="qr" src={qrDataUrl} alt="WhatsApp QR" />}
          </div>

          <div className="panel">
            <div className="panelHeader">
              <h2>Send Test</h2>
              <Send size={18} />
            </div>
            <label>
              Number
              <select value={selectedNumber?.id ?? ""} onChange={(e) => setSelectedNumberId(e.target.value)}>
                {numbers.map((number) => <option key={number.id} value={number.id}>{number.label}</option>)}
              </select>
            </label>
            <label>
              Recipient
              <input value={recipient} onChange={(e) => setRecipient(e.target.value)} />
            </label>
            <label>
              Message
              <textarea value={body} onChange={(e) => setBody(e.target.value)} />
            </label>
            <button className="wide primary" onClick={sendMessage}><Send size={16} /> Send Message</button>
          </div>
        </section>

        <section className="panel tablePanel">
          <div className="panelHeader">
            <h2>Message Log</h2>
            <MessageSquareText size={18} />
          </div>
          <div className="table">
            {messages.map((message) => (
              <div className="row" key={message.id}>
                <span>{message.direction}</span>
                <strong>{message.recipient ?? "-"}</strong>
                <p>{message.body}</p>
                <em data-status={message.status}>{message.status}</em>
              </div>
            ))}
            {!messages.length && <div className="empty">Belum ada pesan.</div>}
          </div>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
