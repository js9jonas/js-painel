"use client"

import { useState, useEffect, useCallback } from "react";

interface Instance {
  id?: string;
  name?: string;
  connectionStatus?: string;
  profileName?: string;
  profilePicUrl?: string;
}

interface QRModalProps {
  instance: string;
  onClose: (connected: boolean) => void;
}

interface CreateModalProps {
  onCreate: (name: string) => void;
  onClose: () => void;
}

interface InstanceCardProps {
  inst: Instance;
  onRefresh: () => void;
}

const API_URL = process.env.NEXT_PUBLIC_EVOLUTION_URL!;
const API_KEY = process.env.NEXT_PUBLIC_EVOLUTION_KEY!;

const headers: Record<string, string> = {
  "Content-Type": "application/json",
  apikey: API_KEY,
};

const api = (path: string, options: RequestInit = {}) =>
  fetch(`/api/evolution${path}`, options).then((r) => r.json())

const STATE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  open:       { label: "Conectado",    color: "#22c55e", bg: "#052e16" },
  connecting: { label: "Conectando",   color: "#f59e0b", bg: "#1c1003" },
  close:      { label: "Desconectado", color: "#ef4444", bg: "#1c0202" },
  default:    { label: "Desconhecido", color: "#6b7280", bg: "#111"    },
};

function QRModal({ instance, onClose }: QRModalProps) {
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api(`/instance/connect/${instance}`).then((d) => {
      setQr(d.base64 ?? null);
      setLoading(false);
    });
    const interval = setInterval(() => {
      api(`/instance/connectionState/${instance}`).then((d) => {
        if (d.instance?.state === "open") onClose(true);
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [instance, onClose]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 100, backdropFilter: "blur(4px)",
      }}
      onClick={() => onClose(false)}
    >
      <div
        style={{
          background: "#0f0f0f", border: "1px solid #222", borderRadius: 16,
          padding: 32, textAlign: "center", maxWidth: 340,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontFamily: "monospace", color: "#22c55e", marginBottom: 8, fontSize: 12, letterSpacing: 2 }}>
          ESCANEIE O QR CODE
        </div>
        <div style={{ color: "#555", fontSize: 11, marginBottom: 20 }}>
          instância: <span style={{ color: "#888" }}>{instance}</span>
        </div>
        {loading ? (
          <div style={{ width: 256, height: 256, background: "#1a1a1a", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
            Carregando...
          </div>
        ) : qr ? (
          <img src={qr} alt="QR Code" style={{ width: 256, height: 256, borderRadius: 8 }} />
        ) : (
          <div style={{ color: "#ef4444" }}>Erro ao carregar QR</div>
        )}
        <div style={{ color: "#444", fontSize: 11, marginTop: 16 }}>
          Verificando conexão automaticamente...
        </div>
        <button
          onClick={() => onClose(false)}
          style={{
            marginTop: 16, background: "transparent", border: "1px solid #333",
            color: "#666", padding: "8px 24px", borderRadius: 8, cursor: "pointer", fontSize: 12,
          }}
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

function CreateModal({ onCreate, onClose }: CreateModalProps) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    try {
      const r = await api("/instance/create", {
        method: "POST",
        body: JSON.stringify({ instanceName: name.trim(), integration: "WHATSAPP-BAILEYS" }),
      });
      if (r.instance) onCreate(r.instance.instanceName);
      else setError("Erro ao criar instância");
    } catch {
      setError("Erro de conexão");
    }
    setLoading(false);
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 100, backdropFilter: "blur(4px)",
      }}
      onClick={() => onClose()}
    >
      <div
        style={{ background: "#0f0f0f", border: "1px solid #222", borderRadius: 16, padding: 32, width: 360 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontFamily: "monospace", color: "#22c55e", marginBottom: 20, fontSize: 12, letterSpacing: 2 }}>
          NOVA INSTÂNCIA
        </div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="nome-da-instancia"
          style={{
            width: "100%", background: "#1a1a1a", border: "1px solid #333",
            borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14,
            fontFamily: "monospace", outline: "none", boxSizing: "border-box",
          }}
        />
        {error && <div style={{ color: "#ef4444", fontSize: 12, marginTop: 8 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, background: "transparent", border: "1px solid #333",
              color: "#666", padding: "10px", borderRadius: 8, cursor: "pointer", fontSize: 13,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={loading || !name.trim()}
            style={{
              flex: 1, background: loading ? "#1a2e1a" : "#16a34a", border: "none",
              color: "#fff", padding: "10px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
            }}
          >
            {loading ? "Criando..." : "Criar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InstanceCard({ inst, onRefresh }: InstanceCardProps) {
  const [loading, setLoading] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const state = inst.connectionStatus || "default"
  const cfg = STATE_CONFIG[state] ?? STATE_CONFIG["default"];
  const name = inst.name || "?"

  const handleDelete = async () => {
    if (!confirm) { setConfirm(true); return; }
    setLoading(true);
    await api(`/instance/delete/${name}`, { method: "DELETE" });
    onRefresh();
  };

  const handleLogout = async () => {
    setLoading(true);
    await api(`/instance/logout/${name}`, { method: "DELETE" });
    onRefresh();
    setLoading(false);
  };

  const handleQRClose = (connected: boolean) => {
    setShowQR(false);
    if (connected) onRefresh();
  };

  return (
    <>
      {showQR && <QRModal instance={name} onClose={handleQRClose} />}
      <div
        style={{
          background: "#0f0f0f",
          border: `1px solid ${state === "open" ? "#1a3d1a" : "#1e1e1e"}`,
          borderRadius: 12, padding: "20px 24px", transition: "border-color 0.3s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: "monospace", color: "#fff", fontSize: 15, fontWeight: 600 }}>{name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <div
                style={{
                  width: 6, height: 6, borderRadius: "50%", background: cfg.color,
                  boxShadow: state === "open" ? `0 0 6px ${cfg.color}` : "none",
                }}
              />
              <span style={{ fontSize: 11, color: cfg.color, fontFamily: "monospace", letterSpacing: 1 }}>
                {cfg.label.toUpperCase()}
              </span>
            </div>
          </div>
          <div
            style={{
              background: cfg.bg, border: `1px solid ${cfg.color}22`,
              borderRadius: 8, padding: "4px 10px", fontSize: 11, color: cfg.color, fontFamily: "monospace",
            }}
          >
            {state}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {state !== "open" && (
            <button
              onClick={() => setShowQR(true)}
              style={{
                flex: 1, background: "#16a34a", border: "none", color: "#fff",
                padding: "8px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
              }}
            >
              Conectar QR
            </button>
          )}
          {state === "open" && (
            <button
              onClick={handleLogout}
              disabled={loading}
              style={{
                flex: 1, background: "#1a1a00", border: "1px solid #333", color: "#999",
                padding: "8px", borderRadius: 8, cursor: "pointer", fontSize: 12,
              }}
            >
              Desconectar
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={loading}
            style={{
              flex: confirm ? 2 : 1,
              background: confirm ? "#7f1d1d" : "transparent",
              border: `1px solid ${confirm ? "#ef4444" : "#2a2a2a"}`,
              color: confirm ? "#fca5a5" : "#555",
              padding: "8px", borderRadius: 8, cursor: "pointer", fontSize: 12, transition: "all 0.2s",
            }}
            onMouseLeave={() => setConfirm(false)}
          >
            {confirm ? "Confirmar exclusão" : "Deletar"}
          </button>
        </div>
      </div>
    </>
  );
}

export default function EvolutionDashboard() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchInstances = useCallback(async () => {
    try {
      const data = await api("/instance/fetchInstances");
      if (Array.isArray(data)) setInstances(data);
      setLastUpdate(new Date());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchInstances();
    const interval = setInterval(fetchInstances, 15000);
    return () => clearInterval(interval);
  }, [fetchInstances]);

  const handleCreate = (_name: string) => {
    setShowCreate(false);
    fetchInstances();
  };

  const connected = instances.filter((i: Instance) => i.connectionStatus === "open").length;

  return (
    <div
      style={{
        minHeight: "100vh", background: "#080808", padding: 24,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      }}
    >
      {showCreate && <CreateModal onCreate={handleCreate} onClose={() => setShowCreate(false)} />}

      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <div style={{ fontSize: 10, color: "#333", letterSpacing: 3, marginBottom: 4 }}>EVOLUTION API</div>
            <h1 style={{ margin: 0, fontSize: 24, color: "#fff", fontWeight: 700, letterSpacing: -0.5 }}>
              Instâncias
            </h1>
            <div style={{ fontSize: 11, color: "#333", marginTop: 4 }}>
              {lastUpdate && `Atualizado às ${lastUpdate.toLocaleTimeString("pt-BR")}`}
            </div>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              background: "#16a34a", border: "none", color: "#fff",
              padding: "10px 20px", borderRadius: 10, cursor: "pointer",
              fontSize: 13, fontWeight: 700, letterSpacing: 0.5,
            }}
          >
            + Nova instância
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          {[
            { label: "TOTAL",         value: instances.length,            color: "#fff"     },
            { label: "CONECTADAS",    value: connected,                   color: "#22c55e"  },
            { label: "DESCONECTADAS", value: instances.length - connected, color: "#ef4444" },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                flex: 1, background: "#0f0f0f", border: "1px solid #1e1e1e",
                borderRadius: 10, padding: "14px 18px",
              }}
            >
              <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 28, color: s.color, fontWeight: 700 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Instances */}
        {loading ? (
          <div style={{ color: "#333", textAlign: "center", padding: 40 }}>Carregando...</div>
        ) : instances.length === 0 ? (
          <div
            style={{
              background: "#0f0f0f", border: "1px dashed #222", borderRadius: 12,
              padding: 48, textAlign: "center", color: "#333",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>📡</div>
            <div>Nenhuma instância criada</div>
            <button
              onClick={() => setShowCreate(true)}
              style={{
                marginTop: 16, background: "transparent", border: "1px solid #333",
                color: "#555", padding: "8px 20px", borderRadius: 8, cursor: "pointer", fontSize: 12,
              }}
            >
              Criar primeira instância
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
            {instances.map((inst, i) => (
              <InstanceCard key={i} inst={inst} onRefresh={fetchInstances} />
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 32, fontSize: 10, color: "#222", letterSpacing: 2 }}>
          AUTO-REFRESH A CADA 15S · {API_URL}
        </div>
      </div>
    </div>
  );
}