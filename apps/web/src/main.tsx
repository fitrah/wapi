import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, KeyRound, Link2, LogIn, MessageSquareText, Plus, QrCode, RefreshCw, Send, Smartphone } from "lucide-react";
import "./styles.css";

type Tenant = {
  id: string;
  name: string;
  plan: string;
  maxNumbers: number;
  dailyMessageLimit: number;
  apiKey: string;
};

type User = {
  id: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "agent";
};

type Plan = {
  slug: string;
  name: string;
  monthlyPriceIdr: number;
  monthlyMessageLimit: number | null;
  maxNumbers: number;
  maxAgents: number;
  attachmentEnabled: boolean;
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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("wapi_session");
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers
    }
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json.data ?? json;
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("wapi_session") ?? "");
  const [user, setUser] = useState<User | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [numbers, setNumbers] = useState<WaNumber[]>([]);
  const [messages, setMessages] = useState<MessageLog[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [label, setLabel] = useState("");
  const [recipient, setRecipient] = useState("6281234567890");
  const [body, setBody] = useState("Halo, ini test dari Wapi.");
  const [selectedNumberId, setSelectedNumberId] = useState("");
  const [notice, setNotice] = useState("");

  const activeTenant = tenants[0];
  const selectedNumber = useMemo(
    () => numbers.find((number) => number.id === selectedNumberId) ?? numbers[0],
    [numbers, selectedNumberId]
  );

  async function refresh() {
    const [meRes, planRes, numberRes, messageRes] = await Promise.all([
      api<{ tenant: Tenant; user: User }>("/api/auth/me"),
      api<Plan[]>("/api/admin/plans"),
      api<WaNumber[]>("/api/numbers"),
      api<MessageLog[]>("/api/messages")
    ]);
    setTenants([meRes.tenant]);
    setUser(meRes.user);
    setPlans(planRes);
    setNumbers(numberRes);
    setMessages(messageRes);
    if (!selectedNumberId && numberRes[0]) setSelectedNumberId(numberRes[0].id);
  }

  useEffect(() => {
    if (token) refresh().catch((error) => setNotice(error.message));
  }, [token]);

  function handleAuth(nextToken: string) {
    localStorage.setItem("wapi_session", nextToken);
    setToken(nextToken);
  }

  function logout() {
    localStorage.removeItem("wapi_session");
    setToken("");
    setUser(null);
    setTenants([]);
    setNumbers([]);
    setMessages([]);
  }

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
    setNotice("Pesan masuk queue dan diproses worker.");
    await refresh();
  }

  if (!token) return <AuthScreen onAuth={handleAuth} />;

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
          <button><KeyRound size={17} /> Packages</button>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p>{activeTenant?.name ?? "Workspace"} · {user?.email ?? ""}</p>
            <h1>WA API gateway for multi-number automation</h1>
          </div>
          <div className="topActions">
            <button onClick={() => refresh()}><RefreshCw size={16} /> Refresh</button>
            <button onClick={logout}><LogIn size={16} /> Logout</button>
          </div>
        </header>

        <section className="stats">
          <div>
            <span>Plan</span>
            <strong>{activeTenant?.plan ?? "free"}</strong>
          </div>
          <div>
            <span>Numbers</span>
            <strong>{numbers.length}/{activeTenant?.maxNumbers ?? 0}</strong>
          </div>
          <div>
            <span>Monthly Limit</span>
            <strong>{activeTenant?.dailyMessageLimit ? activeTenant.dailyMessageLimit.toLocaleString("id-ID") : "Unlimited"}</strong>
          </div>
          <div>
            <span>Account</span>
            <code>{user?.role ?? "-"}</code>
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
            <h2>Packages</h2>
            <KeyRound size={18} />
          </div>
          <div className="planGrid">
            {plans.map((plan) => (
              <div className="plan" key={plan.slug}>
                <strong>{plan.name}</strong>
                <span>{plan.monthlyPriceIdr ? `Rp${plan.monthlyPriceIdr.toLocaleString("id-ID")}/bulan` : "Free"}</span>
                <p>{plan.monthlyMessageLimit ? `${plan.monthlyMessageLimit.toLocaleString("id-ID")} pesan/bulan` : "Unlimited messages"}</p>
                <small>{plan.maxNumbers} nomor · {plan.maxAgents} agent · {plan.attachmentEnabled ? "attachment" : "text only"}</small>
              </div>
            ))}
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

function AuthScreen({ onAuth }: { onAuth: (token: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [tenantName, setTenantName] = useState("Wapi Demo");
  const [ownerName, setOwnerName] = useState("Demo Owner");
  const [email, setEmail] = useState("demo@wapi.local");
  const [password, setPassword] = useState("demo12345");
  const [notice, setNotice] = useState("");

  async function submit() {
    try {
      const payload =
        mode === "login"
          ? { email, password }
          : { tenantName, ownerName, email, password, notificationEmail: email, plan: "free" };
      const result = await api<{ session: { token: string } }>(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      onAuth(result.session.token);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Auth failed");
    }
  }

  return (
    <main className="authShell">
      <section className="authPanel">
        <div className="brand authBrand">
          <div className="brandIcon"><MessageSquareText size={20} /></div>
          <div>
            <strong>Wapi</strong>
            <span>WA API Console</span>
          </div>
        </div>
        <div className="segmented">
          <button className={mode === "login" ? "activeSegment" : ""} onClick={() => setMode("login")}>Login</button>
          <button className={mode === "register" ? "activeSegment" : ""} onClick={() => setMode("register")}>Register</button>
        </div>
        {mode === "register" && (
          <>
            <label>Workspace<input value={tenantName} onChange={(event) => setTenantName(event.target.value)} /></label>
            <label>Name<input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} /></label>
          </>
        )}
        <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {notice && <div className="notice">{notice}</div>}
        <button className="wide primary" onClick={submit}><LogIn size={16} /> {mode === "login" ? "Login" : "Create Workspace"}</button>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
