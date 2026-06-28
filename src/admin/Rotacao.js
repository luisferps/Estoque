import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { pageWrap } from "../shared/styles";

// Backend Railway (mesmo do CRM)
const WA_AGENT_URL = "https://agentes-de-whatsapp-production.up.railway.app";
const WA_API_KEY = "40d03599cab78737a4c9eaf7c00723dbe1bc93b6b329fce0a80ff43d393e4c47";
const INSTANCIA = "LuisFernando";

const DAYS_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const TABS = [
  { key: "previa", label: "Prévia & Diagnóstico", emoji: "🎯" },
  { key: "fila", label: "Fila", emoji: "📋" },
  { key: "config", label: "Configuração", emoji: "⚙️" },
];

export default function Rotacao() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("previa");
  const [agenda, setAgenda] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [diagnostico, setDiagnostico] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [disparando, setDisparando] = useState(false);
  const [toast, setToast] = useState("");
  const [toastErr, setToastErr] = useState(false);
  const saveQueue = useRef(Promise.resolve());

  function showToast(msg, err = false) {
    setToast(msg); setToastErr(err);
    setTimeout(() => setToast(""), 3500);
  }

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [rAg, rPrev, rDiag] = await Promise.all([
        fetch(`${WA_AGENT_URL}/scheduler/agenda?instancia=${encodeURIComponent(INSTANCIA)}`),
        fetch(`${WA_AGENT_URL}/scheduler/preview-estoque?instancia=${encodeURIComponent(INSTANCIA)}`),
        fetch(`${WA_AGENT_URL}/scheduler/diagnostico-estoque?instancia=${encodeURIComponent(INSTANCIA)}`),
      ]);
      if (rAg.ok) setAgenda(await rAg.json());
      if (rPrev.ok) setPrevia(await rPrev.json());
      if (rDiag.ok) setDiagnostico(await rDiag.json());
    } catch {
      showToast("Erro ao carregar dados da rotação", true);
    }
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Salva alterações na agenda (horários) de forma serializada
  function salvarHorarios(novosHorarios) {
    saveQueue.current = saveQueue.current.then(async () => {
      try {
        const r = await fetch(`${WA_AGENT_URL}/scheduler/update`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: WA_API_KEY, "x-instancia": INSTANCIA },
          body: JSON.stringify({ horarios: novosHorarios, instancia: INSTANCIA, grupos: agenda?.grupos }),
        });
        if (r.ok) showToast("Configuração salva ✓");
        else showToast("Erro ao salvar", true);
      } catch { showToast("Erro ao salvar", true); }
    });
    return saveQueue.current;
  }

  async function dispararAgora(horarioKey) {
    if (!window.confirm(`Disparar a rotação AGORA (${horarioKey})?\nIsso envia mensagens reais nos grupos do WhatsApp.`)) return;
    setDisparando(true);
    try {
      const r = await fetch(`${WA_AGENT_URL}/scheduler/testar-estoque`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: WA_API_KEY, "x-instancia": INSTANCIA },
        body: JSON.stringify({ instancia: INSTANCIA, horario: horarioKey }),
      });
      const data = await r.json();
      if (r.ok) showToast(data.msg || "Disparo iniciado ✓");
      else showToast(data.error || "Erro ao disparar", true);
    } catch { showToast("Erro ao disparar", true); }
    setDisparando(false);
  }

  return (
    <div style={pageWrap(1100)}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "0.5rem", flexWrap: "wrap" }}>
        <button onClick={() => navigate(-1)} style={backBtn}>← Voltar</button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--primary-dark)", flex: 1 }}>🔄 Rotação de Estoque</h2>
        <button onClick={carregar} disabled={carregando}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
          {carregando ? "Atualizando..." : "↻ Atualizar"}
        </button>
      </div>

      <p style={{ margin: "0 0 1rem", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
        Sorteia automaticamente os imóveis disponíveis e os divulga nos grupos de WhatsApp, respeitando o tipo, a modalidade e a região de cada grupo. Quem foi divulgado vai para o fim da fila.
      </p>

      {/* Cartões de resumo */}
      {diagnostico?.resumo && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: "1.2rem" }}>
          <Card n={diagnostico.resumo.dentro} label="Na rotação" cor="#16a34a" />
          <Card n={diagnostico.resumo.fora} label="Fora da rotação" cor="#dc2626" />
          <Card n={diagnostico.resumo.gruposAtivos} label="Grupos ativos" cor="var(--primary)" />
          <Card n={previa?.totalGruposCasados ?? "—"} label="Grupos com match agora" cor="var(--primary)" />
        </div>
      )}

      {/* Abas */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", marginBottom: "1.2rem", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: "10px 16px", border: "none", background: "none", cursor: "pointer",
              fontSize: 14, fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? "var(--primary)" : "var(--text-muted)",
              borderBottom: tab === t.key ? "2px solid var(--primary)" : "2px solid transparent",
            }}>
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {carregando && <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>Carregando...</p>}

      {!carregando && tab === "previa" && <AbaPrevia previa={previa} diagnostico={diagnostico} />}
      {!carregando && tab === "fila" && <AbaFila diagnostico={diagnostico} />}
      {!carregando && tab === "config" && (
        <AbaConfig agenda={agenda} setAgenda={setAgenda} salvarHorarios={salvarHorarios} dispararAgora={dispararAgora} disparando={disparando} />
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: toastErr ? "#dc2626" : "#16a34a", color: "#fff", padding: "12px 22px", borderRadius: 10, fontSize: 14, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.25)", zIndex: 999 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── Aba 1: Prévia (o que vai rodar) + Diagnóstico (o que está fora e por quê) ───
function AbaPrevia({ previa, diagnostico }) {
  return (
    <div>
      {/* O que será anunciado agora */}
      <h3 style={secTitle}>O que seria anunciado agora</h3>
      {previa?.atribuicoes?.length > 0 ? (
        <div style={{ border: "1px solid var(--border-soft)", borderRadius: 10, overflow: "hidden", marginBottom: "1.8rem" }}>
          {previa.atribuicoes.map((a, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "10px 14px", borderBottom: i < previa.atribuicoes.length - 1 ? "1px solid var(--border-soft)" : "none", alignItems: "flex-start", flexWrap: "wrap", background: i % 2 ? "var(--bg-section)" : "var(--bg-card)" }}>
              <div style={{ flex: "1 1 280px", minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
                  <span style={tagSm("primary")}>{a.imovel.tipo}</span>
                  <span style={tagSm()}>{a.imovel.transacao}</span>
                </div>
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-soft)", lineHeight: 1.4 }}>
                  {(a.imovel.descricao || "").split("\n")[0]}
                </p>
              </div>
              <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
                <span style={{ fontSize: 14 }}>→</span>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{a.grupo.nome}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: "1.8rem" }}>Nenhuma atribuição no momento (pode ser cooldown — todos já rodaram recentemente).</p>
      )}

      {/* Diagnóstico: imóveis fora da rotação */}
      <h3 style={secTitle}>Imóveis fora da rotação {diagnostico?.fora ? `(${diagnostico.fora.length})` : ""}</h3>
      {diagnostico?.fora?.length > 0 ? (
        <div style={{ border: "1px solid var(--border-soft)", borderRadius: 10, overflow: "hidden" }}>
          {diagnostico.fora.map((im, i) => (
            <div key={im.id} style={{ display: "flex", gap: 12, padding: "10px 14px", borderBottom: i < diagnostico.fora.length - 1 ? "1px solid var(--border-soft)" : "none", alignItems: "flex-start", flexWrap: "wrap", background: i % 2 ? "var(--bg-section)" : "var(--bg-card)" }}>
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
                  <span style={tagSm("primary")}>{im.tipo}</span>
                  {im.transacao && <span style={tagSm()}>{im.transacao}</span>}
                </div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{im.titulo}</p>
                {(im.bairro || im.cidade) && <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--text-muted)" }}>{[im.bairro, im.cidade].filter(Boolean).join(", ")}</p>}
              </div>
              <div style={{ flex: "1 1 200px", display: "flex", alignItems: "center" }}>
                <span style={{ fontSize: 12.5, color: "#b45309", background: "#fef3c7", borderRadius: 6, padding: "5px 10px", lineHeight: 1.4 }}>
                  {im.motivo}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ color: "#16a34a", fontSize: 13, fontWeight: 600 }}>✓ Todos os imóveis elegíveis estão na rotação.</p>
      )}
    </div>
  );
}

// ─── Aba 2: Fila (ordem justa por nº de divulgações) ───
function AbaFila({ diagnostico }) {
  const fila = diagnostico?.dentro || [];
  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 1rem" }}>
        Ordem de prioridade: quem foi divulgado menos vezes aparece primeiro. Após ser anunciado, o imóvel desce na fila.
      </p>
      {fila.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Nenhum imóvel na fila no momento.</p>
      ) : (
        <div style={{ border: "1px solid var(--border-soft)", borderRadius: 10, overflow: "hidden" }}>
          {fila.map((im, i) => (
            <div key={im.id} style={{ display: "flex", gap: 12, padding: "10px 14px", borderBottom: i < fila.length - 1 ? "1px solid var(--border-soft)" : "none", alignItems: "center", flexWrap: "wrap", background: i % 2 ? "var(--bg-section)" : "var(--bg-card)" }}>
              <span style={{ flex: "0 0 28px", fontWeight: 700, color: "var(--primary)", fontSize: 14 }}>{i + 1}º</span>
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
                  <span style={tagSm("primary")}>{im.tipo}</span>
                  {im.transacao && <span style={tagSm()}>{im.transacao}</span>}
                </div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{im.titulo}</p>
              </div>
              <div style={{ flex: "0 0 auto", textAlign: "right", fontSize: 12, color: "var(--text-muted)" }}>
                <div><strong style={{ color: "var(--text)" }}>{im.divulgacoes}</strong> divulgação(ões)</div>
                <div>{im.gruposDisponiveis}/{im.gruposCompativeis} grupos disponíveis</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Aba 3: Configuração (horários + ligar/desligar + disparar agora) ───
function AbaConfig({ agenda, setAgenda, salvarHorarios, dispararAgora, disparando }) {
  const horarios = agenda?.horarios || {};
  const slots = [
    { key: "estoque1", label: "1º disparo do dia" },
    { key: "estoque2", label: "2º disparo do dia" },
  ];

  function atualizar(slotKey, campo, valor) {
    const novo = {
      ...horarios,
      [slotKey]: { ...(horarios[slotKey] || { days: [1, 2, 3, 4, 5, 6, 0], time: "11:00", ativo: true }), [campo]: valor },
    };
    setAgenda(a => ({ ...a, horarios: novo }));
    salvarHorarios(novo);
  }

  function toggleDia(slotKey, dia) {
    const atual = horarios[slotKey] || { days: [], time: "11:00", ativo: true };
    const days = atual.days || [];
    const novosDays = days.includes(dia) ? days.filter(d => d !== dia) : [...days, dia].sort();
    atualizar(slotKey, "days", novosDays);
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 1.2rem" }}>
        A rotação dispara automaticamente nos horários abaixo. Cada disparo sorteia imóveis e envia para os grupos compatíveis.
      </p>

      {slots.map(slot => {
        const h = horarios[slot.key] || { days: [], time: "11:00", ativo: false };
        return (
          <div key={slot.key} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "1.1rem 1.2rem", marginBottom: "1rem", background: "var(--bg-card)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <label style={{ position: "relative", display: "inline-block", width: 44, height: 24 }}>
                  <input type="checkbox" checked={!!h.ativo} onChange={e => atualizar(slot.key, "ativo", e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                  <span style={{ position: "absolute", cursor: "pointer", inset: 0, background: h.ativo ? "var(--primary)" : "var(--border)", borderRadius: 24, transition: ".2s" }}>
                    <span style={{ position: "absolute", height: 18, width: 18, left: h.ativo ? 23 : 3, bottom: 3, background: "#fff", borderRadius: "50%", transition: ".2s" }} />
                  </span>
                </label>
                <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>{slot.label}</span>
              </div>
              <input type="time" value={h.time || "11:00"} onChange={e => atualizar(slot.key, "time", e.target.value)}
                style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-input)", color: "var(--text)", fontSize: 14 }} />
            </div>

            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 14 }}>
              {DAYS_LABEL.map((d, idx) => {
                const on = (h.days || []).includes(idx);
                return (
                  <button key={idx} onClick={() => toggleDia(slot.key, idx)}
                    style={{ padding: "6px 11px", borderRadius: 8, border: `1px solid ${on ? "var(--primary)" : "var(--border-soft)"}`, background: on ? "var(--primary-light)" : "var(--bg-muted)", color: on ? "var(--primary-dark)" : "var(--text-muted)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                    {d}
                  </button>
                );
              })}
            </div>

            <button onClick={() => dispararAgora(slot.key)} disabled={disparando}
              style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid var(--primary)", background: "var(--primary-light)", color: "var(--primary-dark)", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
              {disparando ? "Disparando..." : "⚡ Disparar agora (teste)"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Card({ n, label, cor }) {
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-soft)", borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: cor }}>{n}</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

const secTitle = { fontSize: 15, fontWeight: 700, color: "var(--primary-dark)", margin: "0 0 0.8rem" };
const backBtn = { display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", fontSize: 15, cursor: "pointer", color: "var(--primary)", fontWeight: 500, padding: 0 };
const tagSm = (variant) => ({
  fontSize: 11,
  background: variant === "primary" ? "var(--primary-light)" : "var(--bg-muted)",
  color: variant === "primary" ? "var(--primary-dark)" : "var(--text-soft)",
  borderRadius: 6, padding: "2px 7px",
});
