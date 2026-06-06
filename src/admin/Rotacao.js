import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useImoveis } from "../shared/hooks";
import { pageWrap } from "../shared/styles";

// URL do backend Railway (mesmo usado pelo CRM)
const WA_AGENT_URL = "https://agentes-de-whatsapp-production.up.railway.app";
const WA_API_KEY = "40d03599cab78737a4c9eaf7c00723dbe1bc93b6b329fce0a80ff43d393e4c47";
const INSTANCIA = "LuisFernando";

const DAYS_LABEL = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

const REGRAS_MODALIDADE = [
  { key: "nao_receber", label: "Não receber", emoji: "🚫", desc: "Esta categoria não recebe imóveis do estoque" },
  { key: "locacao",     label: "Só Locação", emoji: "🔑", desc: "Apenas imóveis para alugar" },
  { key: "venda",       label: "Só Venda",   emoji: "🏷️", desc: "Apenas imóveis para vender" },
  { key: "ambos",       label: "Locação + Venda", emoji: "🤝", desc: "Mistura ofertas de locação e venda" },
];

const TABS = [
  { key: "config", label: "Configuração", emoji: "⚙️" },
  { key: "fila", label: "Próximos da fila", emoji: "🎯" },
  { key: "historico", label: "Histórico", emoji: "📊" },
  { key: "logs", label: "Logs", emoji: "📋" },
];

export default function Rotacao({ onLogout }) {
  const navigate = useNavigate();
  const { imoveis } = useImoveis();
  const [agenda, setAgenda] = useState({ cats: {}, grupos: [], categorias: [] });
  const [categorias, setCategorias] = useState([]);
  const [mapeamento, setMapeamento] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [tab, setTab] = useState("config");
  const [toast, setToast] = useState("");
  const [toastErr, setToastErr] = useState(false);
  const [logs, setLogs] = useState([]);
  const [disparando, setDisparando] = useState(null); // catId em disparo

  function showToast(msg, err = false) {
    setToast(msg); setToastErr(err);
    setTimeout(() => setToast(""), 3000);
  }

  // Carrega agenda do scheduler
  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch(`${WA_AGENT_URL}/scheduler/agenda?instancia=${encodeURIComponent(INSTANCIA)}`);
      if (res.ok) {
        const data = await res.json();
        setAgenda(data);
        setCategorias(data.categorias || []);
        setMapeamento(data.mapeamento_modalidade_estoque || {});
      }
    } catch {
      showToast("Erro ao carregar dados do scheduler", true);
    }
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Carrega logs ao trocar pra aba de logs
  useEffect(() => {
    if (tab !== "logs") return;
    fetch(`${WA_AGENT_URL}/rotacao/logs?instancia=${encodeURIComponent(INSTANCIA)}`)
      .then(r => r.json())
      .then(d => setLogs(d.logs || []))
      .catch(() => {});
  }, [tab]);

  // ── Fila serializada de saves (igual ao CRM) ─────────────────────────────
  const agendaRef = useRef(agenda);
  useEffect(() => { agendaRef.current = agenda; }, [agenda]);
  const mapRef = useRef(mapeamento);
  useEffect(() => { mapRef.current = mapeamento; }, [mapeamento]);
  const filaSave = useRef(Promise.resolve());

  function enfileirarSave(payload = {}) {
    filaSave.current = filaSave.current.then(async () => {
      const body = {
        instancia: INSTANCIA,
        ...(payload.cats !== undefined && { cats: payload.cats }),
        ...(payload.mapeamento_modalidade_estoque !== undefined && { mapeamento_modalidade_estoque: payload.mapeamento_modalidade_estoque }),
      };
      try {
        const r = await fetch(`${WA_AGENT_URL}/scheduler/update`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: WA_API_KEY, "x-instancia": INSTANCIA },
          body: JSON.stringify(body),
        });
        if (r.ok) showToast("Salvo ✓");
        else showToast("Erro ao salvar", true);
      } catch { showToast("Erro ao salvar", true); }
    }).catch(() => {});
    return filaSave.current;
  }

  // ── Atualizar mapeamento de modalidade ──────────────────────────────────
  function setRegraModalidade(catId, regra) {
    const novo = { ...mapeamento, [catId]: regra };
    setMapeamento(novo);
    mapRef.current = novo;
    enfileirarSave({ mapeamento_modalidade_estoque: novo });
  }

  // ── Toggle Rotação Estoque por slot ─────────────────────────────────────
  function toggleRotacaoSlot(catId, slotIdx) {
    const novaCats = { ...(agenda.cats || {}) };
    const slots = [...(novaCats[catId]?.slots || [])];
    const atual = slots[slotIdx];
    const novoEstado = !atual.rotacao_estoque;
    slots[slotIdx] = {
      ...atual,
      rotacao_estoque: novoEstado,
      // Se ligou rotação, desliga CRM (mutuamente exclusivos)
      ...(novoEstado && { espelhar_crm: false }),
    };
    novaCats[catId] = { ...novaCats[catId], slots };
    const novaAgenda = { ...agenda, cats: novaCats };
    setAgenda(novaAgenda);
    agendaRef.current = novaAgenda;
    enfileirarSave({ cats: novaCats });
  }

  // ── Toggle ativo/suspender slot ─────────────────────────────────────────
  function toggleAtivoSlot(catId, slotIdx) {
    const novaCats = { ...(agenda.cats || {}) };
    const slots = [...(novaCats[catId]?.slots || [])];
    const atual = slots[slotIdx].ativo !== false;
    slots[slotIdx] = { ...slots[slotIdx], ativo: !atual };
    novaCats[catId] = { ...novaCats[catId], slots };
    const novaAgenda = { ...agenda, cats: novaCats };
    setAgenda(novaAgenda);
    agendaRef.current = novaAgenda;
    enfileirarSave({ cats: novaCats });
  }

  // ── Calcula próximos imóveis da fila por categoria ──────────────────────
  function calcularFilaCategoria(catId) {
    const regra = mapeamento[catId] || "nao_receber";
    if (regra === "nao_receber") return [];
    const candidatos = imoveis.filter(im => {
      if ((im.status || "").toLowerCase().replace(/[\u0300-\u036f]/g, "") !== "disponivel" &&
          im.status !== "Disponível") return false;
      if (!im.anuncios?.["WhatsApp Grupos"]?.ativo) return false;
      if (!im.descricao || !im.descricao.trim()) return false;
      const isLoc = im.transacao === "Locação";
      const isVen = im.transacao === "Venda" || im.transacao === "Venda e Locação";
      if (regra === "locacao" && !isLoc) return false;
      if (regra === "venda" && !isVen) return false;
      if (regra === "ambos" && !isLoc && !isVen) return false;
      return true;
    });
    // Ordena: menor contador primeiro; entre iguais, ordem aleatória estável
    return candidatos.sort((a, b) => {
      const da = a.divulgacoesAutomaticas || 0;
      const db = b.divulgacoesAutomaticas || 0;
      if (da !== db) return da - db;
      return (a.id || "").localeCompare(b.id || "");
    });
  }

  // ── Histórico (ranking de divulgações) ──────────────────────────────────
  const ranking = useMemo(() => {
    const elegiveis = imoveis.filter(im =>
      im.anuncios?.["WhatsApp Grupos"]?.ativo &&
      (im.status === "Disponível" || (im.status || "").toLowerCase().replace(/[\u0300-\u036f]/g, "") === "disponivel")
    );
    return elegiveis.map(im => ({
      id: im.id,
      titulo: im.titulo || "—",
      bairro: im.bairro || "—",
      transacao: im.transacao || "—",
      count: im.divulgacoesAutomaticas || 0,
      ultima: im.ultimaDivulgacao || null,
    })).sort((a, b) => b.count - a.count);
  }, [imoveis]);

  // ── Disparar AGORA (teste) ──────────────────────────────────────────────
  async function dispararAgora(catId, catName) {
    if (!window.confirm(`Disparar AGORA um imóvel para "${catName}"?\nIsso vai enviar mensagem nos grupos e agendar o status para 10min.`)) return;
    setDisparando(catId);
    try {
      const r = await fetch(`${WA_AGENT_URL}/rotacao/testar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: WA_API_KEY, "x-instancia": INSTANCIA },
        body: JSON.stringify({ instancia: INSTANCIA, catId }),
      });
      const data = await r.json();
      if (r.ok) showToast(data.mensagem || "Disparo executado ✓");
      else showToast(data.error || "Erro ao disparar", true);
    } catch { showToast("Erro ao disparar", true); }
    setDisparando(null);
  }

  // ── UI ──────────────────────────────────────────────────────────────────
  return (
    <div style={pageWrap(1100)}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1rem", flexWrap: "wrap" }}>
        <button onClick={() => navigate(-1)} style={backBtn}>← Voltar</button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, flex: 1, color: "var(--primary-dark)" }}>
          🏠 Rotação Estoque
        </h2>
        <button onClick={carregar} style={btnRefresh}>🔄 Atualizar</button>
      </div>

      <div style={{ marginBottom: 14, padding: "10px 14px", background: "var(--bg-section)", border: "1px solid var(--border-soft)", borderRadius: 8, fontSize: 12, color: "var(--text-muted)" }}>
        Sistema que sorteia automaticamente imóveis do estoque e os divulga em grupos e status do WhatsApp.
        Só entram no sorteio imóveis com <strong>status Disponível</strong>, flag <strong>WhatsApp Grupos</strong> marcada e <strong>descrição preenchida</strong>.
      </div>

      {/* Abas */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, borderBottom: "1px solid var(--border-soft)", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: "10px 16px", border: "none",
              borderBottom: tab === t.key ? "2px solid var(--primary)" : "2px solid transparent",
              background: "transparent",
              color: tab === t.key ? "var(--primary)" : "var(--text-muted)",
              fontWeight: tab === t.key ? 600 : 400, cursor: "pointer", fontSize: 13,
            }}>
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {carregando && <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "3rem 0" }}>Carregando…</div>}

      {!carregando && tab === "config" && (
        <AbaConfig
          agenda={agenda}
          categorias={categorias}
          mapeamento={mapeamento}
          setRegraModalidade={setRegraModalidade}
          toggleRotacaoSlot={toggleRotacaoSlot}
          toggleAtivoSlot={toggleAtivoSlot}
          dispararAgora={dispararAgora}
          disparando={disparando}
        />
      )}

      {!carregando && tab === "fila" && (
        <AbaFila categorias={categorias} agenda={agenda} mapeamento={mapeamento} calcularFila={calcularFilaCategoria} />
      )}

      {!carregando && tab === "historico" && (
        <AbaHistorico ranking={ranking} />
      )}

      {!carregando && tab === "logs" && (
        <AbaLogs logs={logs} />
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", padding: "10px 18px", background: toastErr ? "#fee2e2" : "var(--primary-light)", color: toastErr ? "#b91c1c" : "var(--primary-dark)", border: `1px solid ${toastErr ? "#fca5a5" : "var(--primary)"}`, borderRadius: 8, fontSize: 13, fontWeight: 500, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 100 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── Aba Configuração ─────────────────────────────────────────────────────
function AbaConfig({ agenda, categorias, mapeamento, setRegraModalidade, toggleRotacaoSlot, toggleAtivoSlot, dispararAgora, disparando }) {
  if (categorias.length === 0) {
    return <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
      Nenhuma categoria cadastrada no WA Scheduler. Cadastre as categorias primeiro pelo painel do scheduler.
    </div>;
  }
  return (
    <div>
      {categorias.map(cat => {
        const regra = mapeamento[cat.id] || "nao_receber";
        const slots = agenda.cats?.[cat.id]?.slots || [];
        const grupos = (agenda.grupos || []).filter(g => g.cat === cat.id);
        const regraInfo = REGRAS_MODALIDADE.find(r => r.key === regra);
        return (
          <div key={cat.id} style={{ marginBottom: 14, border: "1px solid var(--border-soft)", borderRadius: 10, overflow: "hidden", background: "var(--bg-card)" }}>
            <div style={{ padding: "12px 16px", background: "var(--bg-section)", borderBottom: "1px solid var(--border-soft)", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: cat.cor || "#888" }} />
              <strong style={{ flex: 1, fontSize: 14, color: "var(--text)" }}>{cat.name}</strong>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{grupos.length} grupo(s)</span>
            </div>
            <div style={{ padding: 14 }}>
              {/* Regra de modalidade */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 8 }}>
                  Regra desta categoria
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {REGRAS_MODALIDADE.map(r => {
                    const sel = regra === r.key;
                    return (
                      <button key={r.key} onClick={() => setRegraModalidade(cat.id, r.key)}
                        style={{
                          padding: "6px 12px", borderRadius: 20,
                          border: `1px solid ${sel ? "var(--primary)" : "var(--border-soft)"}`,
                          background: sel ? "var(--primary-light)" : "var(--bg-input)",
                          color: sel ? "var(--primary-dark)" : "var(--text)",
                          fontSize: 12, fontWeight: sel ? 600 : 400, cursor: "pointer",
                        }}>
                        {r.emoji} {r.label}
                      </button>
                    );
                  })}
                </div>
                {regraInfo && <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>{regraInfo.desc}</p>}
              </div>

              {/* Slots */}
              {slots.length === 0 ? (
                <div style={{ padding: "10px 0", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>Nenhum slot configurado para esta categoria.</div>
              ) : (
                <>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 8 }}>
                    Horários
                  </div>
                  {slots.map((slot, i) => {
                    const rotacao = slot.rotacao_estoque === true;
                    const crm = slot.espelhar_crm === true;
                    const ativo = slot.ativo !== false;
                    const desabilitado = regra === "nao_receber";
                    return (
                      <div key={i} style={{ padding: "10px 12px", background: rotacao ? (ativo ? "var(--primary-light)" : "var(--bg-section)") : "var(--bg-input)", borderRadius: 8, marginBottom: 6, border: `1px solid ${rotacao ? "var(--primary)" : "var(--border-soft)"}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: rotacao ? "var(--primary)" : "var(--text-muted)" }}>⏰ {slot.time}</span>
                          <div style={{ display: "flex", gap: 3, flex: 1 }}>
                            {DAYS_LABEL.map((d, j) => (
                              <span key={j} style={{ fontSize: 10, padding: "1px 5px", borderRadius: 20, background: slot.days?.includes(j) ? "var(--bg-card)" : "transparent", color: slot.days?.includes(j) ? "var(--text-muted)" : "var(--border-soft)", fontWeight: slot.days?.includes(j) ? 600 : 400 }}>{d}</span>
                            ))}
                          </div>
                          {crm && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#dcfce7", color: "#15803d", fontWeight: 600 }}>CRM ativo</span>}
                          <button onClick={() => toggleRotacaoSlot(cat.id, i)} disabled={desabilitado}
                            title={desabilitado ? "Defina uma regra de modalidade primeiro" : ""}
                            style={{
                              padding: "5px 12px", borderRadius: 20,
                              border: `1px solid ${rotacao ? "var(--primary)" : "var(--border-soft)"}`,
                              background: rotacao ? "var(--primary)" : "transparent",
                              color: rotacao ? "#fff" : "var(--text-muted)",
                              fontSize: 11, fontWeight: 600,
                              cursor: desabilitado ? "not-allowed" : "pointer",
                              opacity: desabilitado ? 0.4 : 1,
                            }}>
                            {rotacao ? "✓ Rotação ON" : "Rotação OFF"}
                          </button>
                          {rotacao && (
                            <button onClick={() => toggleAtivoSlot(cat.id, i)}
                              style={{
                                padding: "5px 12px", borderRadius: 20,
                                border: `1px solid ${ativo ? "#f59e0b" : "#dc2626"}`,
                                background: ativo ? "#fffbeb" : "#fee2e2",
                                color: ativo ? "#b45309" : "#dc2626",
                                fontSize: 11, fontWeight: 600, cursor: "pointer",
                              }}>
                              {ativo ? "⏸ Suspender" : "▶ Reativar"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* Botão de teste */}
              {regra !== "nao_receber" && (
                <button onClick={() => dispararAgora(cat.id, cat.name)} disabled={disparando === cat.id}
                  style={{
                    marginTop: 10, padding: "8px 14px", borderRadius: 8,
                    border: "1px solid var(--border-soft)", background: "var(--bg-input)",
                    color: "var(--text)", fontSize: 12, fontWeight: 500,
                    cursor: disparando === cat.id ? "default" : "pointer",
                    opacity: disparando === cat.id ? 0.5 : 1,
                  }}>
                  {disparando === cat.id ? "⏳ Disparando..." : "⚡ Disparar 1 imóvel AGORA (teste)"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Aba Fila ─────────────────────────────────────────────────────────────
function AbaFila({ categorias, mapeamento, calcularFila }) {
  return (
    <div>
      {categorias.filter(cat => (mapeamento[cat.id] || "nao_receber") !== "nao_receber").length === 0 && (
        <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
          Nenhuma categoria configurada com Rotação Estoque. Configure as regras na aba Configuração.
        </div>
      )}
      {categorias.map(cat => {
        const regra = mapeamento[cat.id] || "nao_receber";
        if (regra === "nao_receber") return null;
        const fila = calcularFila(cat.id);
        const regraInfo = REGRAS_MODALIDADE.find(r => r.key === regra);
        return (
          <div key={cat.id} style={{ marginBottom: 14, border: "1px solid var(--border-soft)", borderRadius: 10, overflow: "hidden", background: "var(--bg-card)" }}>
            <div style={{ padding: "12px 16px", background: "var(--bg-section)", borderBottom: "1px solid var(--border-soft)", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: cat.cor || "#888" }} />
              <strong style={{ flex: 1, fontSize: 14, color: "var(--text)" }}>{cat.name}</strong>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{regraInfo?.emoji} {regraInfo?.label} • {fila.length} imóvel(is) elegível(is)</span>
            </div>
            <div style={{ padding: 8 }}>
              {fila.length === 0 ? (
                <div style={{ padding: 14, fontSize: 12, color: "var(--text-muted)", fontStyle: "italic", textAlign: "center" }}>
                  Nenhum imóvel elegível. Verifique se há imóveis Disponíveis, com flag WhatsApp Grupos marcada, descrição preenchida e modalidade compatível.
                </div>
              ) : fila.slice(0, 10).map((im, idx) => (
                <div key={im.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderBottom: idx < Math.min(fila.length - 1, 9) ? "1px solid var(--border-soft)" : "none" }}>
                  <span style={{ fontSize: 11, color: idx === 0 ? "var(--primary)" : "var(--text-muted)", fontWeight: idx === 0 ? 700 : 500, minWidth: 28 }}>
                    {idx === 0 ? "→" : `#${idx + 1}`}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: idx === 0 ? 600 : 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{im.titulo || "—"}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {im.bairro || "—"} • {im.transacao || "—"} • {im.divulgacoesAutomaticas || 0} divulgações
                    </div>
                  </div>
                </div>
              ))}
              {fila.length > 10 && (
                <div style={{ padding: "6px 10px", fontSize: 11, color: "var(--text-muted)", textAlign: "center", fontStyle: "italic" }}>
                  +{fila.length - 10} imóvel(is) na fila
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Aba Histórico ────────────────────────────────────────────────────────
function AbaHistorico({ ranking }) {
  if (ranking.length === 0) {
    return <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
      Nenhum imóvel marcado com flag WhatsApp Grupos ainda.
    </div>;
  }
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-soft)", borderRadius: 10, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "var(--bg-section)", borderBottom: "1px solid var(--border-soft)" }}>
            <th style={th}>#</th>
            <th style={th}>Imóvel</th>
            <th style={th}>Bairro</th>
            <th style={th}>Transação</th>
            <th style={{ ...th, textAlign: "center" }}>Divulgações</th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((im, idx) => (
            <tr key={im.id} style={{ borderBottom: "1px solid var(--border-soft)" }}>
              <td style={td}>{idx + 1}</td>
              <td style={td}>{im.titulo}</td>
              <td style={td}>{im.bairro}</td>
              <td style={td}>{im.transacao}</td>
              <td style={{ ...td, textAlign: "center", fontWeight: 600, color: im.count > 0 ? "var(--primary)" : "var(--text-muted)" }}>{im.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Aba Logs ─────────────────────────────────────────────────────────────
function AbaLogs({ logs }) {
  if (logs.length === 0) {
    return <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
      Nenhum log de rotação ainda. Eventos aparecerão aqui após o primeiro disparo automático ou teste manual.
    </div>;
  }
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-soft)", borderRadius: 10, overflow: "hidden" }}>
      {logs.map((log, i) => {
        const data = new Date(log.timestamp).toLocaleString("pt-BR");
        const cor = log.tipo === "aviso" ? "#b45309"
          : log.sucesso === false ? "#dc2626"
          : log.sucesso === true ? "#15803d"
          : "var(--text-muted)";
        const fundo = log.tipo === "aviso" ? "#fffbeb"
          : log.sucesso === false ? "#fee2e2"
          : log.sucesso === true ? "#dcfce7"
          : "var(--bg-section)";
        return (
          <div key={i} style={{ padding: "10px 14px", borderBottom: i < logs.length - 1 ? "1px solid var(--border-soft)" : "none", background: fundo }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <strong style={{ fontSize: 12, color: cor }}>
                {log.tipo === "grupo" && "💬 Grupo"}
                {log.tipo === "status" && "📸 Status"}
                {log.tipo === "aviso" && "⚠️ Aviso"}
                {log.catName && ` — ${log.catName}`}
              </strong>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{data}</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text)" }}>
              {log.imovelTitulo && <span><strong>{log.imovelTitulo}</strong> </span>}
              {log.grupoNome && <span>→ {log.grupoNome} </span>}
              {log.sucesso === true && <span style={{ color: "#15803d" }}>✓ enviado</span>}
              {log.sucesso === false && <span style={{ color: "#dc2626" }}>✗ falhou</span>}
              {log.mensagem && <span>{log.mensagem}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const th = { padding: "10px 12px", textAlign: "left", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".5px", fontWeight: 600 };
const td = { padding: "10px 12px", color: "var(--text)" };
const backBtn = { display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", fontSize: 15, cursor: "pointer", color: "var(--primary)", fontWeight: 500, padding: 0 };
const btnRefresh = { padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer", fontSize: 12, fontWeight: 500 };
