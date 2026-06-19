import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useImoveis, useTipos } from "../shared/hooks";
import { matchTransacao, ordenarImoveis, statusDoImovel, descricaoPronta } from "../shared/utils";
import { pageWrap } from "../shared/styles";
import { EMPRESA, ORDENACOES } from "../constants";
import Header from "./Header";
import ImovelCard from "../shared/ImovelCard";

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function emojiTipo(nome) {
  const n = semAcento(nome);
  if (n.includes("apart")) return "🏢";
  if (n.includes("sobrado")) return "🏡";
  if (n.includes("cobertura")) return "🏙️";
  if (n.includes("studio") || n.includes("kitnet") || n.includes("flat") || n.includes("loft")) return "🛏️";
  if (n.includes("lote comercial") || n.includes("area comercial") || n.includes("sala") || n.includes("loja") || n.includes("andar corporativo") || n.includes("ponto")) return "🏬";
  if (n.includes("lote") || n.includes("terreno") || n.includes("area")) return "🟩";
  if (n.includes("fazenda") || n.includes("chacara") || n.includes("sitio") || n.includes("rural")) return "🌾";
  if (n.includes("galpao") || n.includes("deposito") || n.includes("armazem")) return "🏭";
  if (n.includes("hotel") || n.includes("pousada") || n.includes("motel")) return "🏨";
  if (n.includes("predio") || n.includes("edificio")) return "🏗️";
  if (n.includes("consultorio")) return "🩺";
  if (n.includes("garagem")) return "🚗";
  if (n.includes("casa")) return "🏠";
  return "🏘️";
}

const MODOS = [
  { key: "Todos", label: "Todos", icon: "🏘️" },
  { key: "Venda", label: "Comprar", icon: "🔑" },
  { key: "Locação", label: "Alugar", icon: "🗓️" },
];

const FAIXAS_FMT = (n) => n >= 1000000 ? `${(n/1000000).toLocaleString("pt-BR", {maximumFractionDigits: 1})} mi` : `${(n/1000).toLocaleString("pt-BR")} mil`;
// Faixas pré-prontas (valor máximo). 0 = sem limite.
const FAIXAS_VENDA = [0, 200000, 350000, 500000, 750000, 1000000, 1500000, 2500000];
const FAIXAS_LOCACAO = [0, 1500, 2500, 4000, 6000, 10000];

function precoDoImovel(im) {
  if (im.transacao === "Locação") return parseFloat(im.valorFinal || im.valorAluguel) || 0;
  return parseFloat(im.preco) || 0;
}

// Popup de compartilhamento (WhatsApp / Email / Copiar link / Copiar texto)
function CompartilharPopup({ im, onCopiarTexto, copiado, onClose }) {
  const link = `${window.location.origin}/imovel/${im.id}`;
  const titulo = im.titulo || "Imóvel";
  const wa = `https://wa.me/?text=${encodeURIComponent(`${titulo}\n${link}`)}`;
  const mail = `mailto:?subject=${encodeURIComponent(titulo)}&body=${encodeURIComponent(`${titulo}\n${link}`)}`;
  const copiarLink = async () => { try { await navigator.clipboard.writeText(link); } catch {} onClose(); };
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 90 }} />
      <div style={{
        position: "absolute", bottom: "calc(100% + 6px)", right: 0, zIndex: 91,
        background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14,
        boxShadow: "0 14px 36px rgba(0,0,0,0.18)", padding: 6, minWidth: 210, color: "var(--text)"
      }}>
        <a href={wa} target="_blank" rel="noreferrer" onClick={e => { e.stopPropagation(); onClose(); }} style={popItem}>💬 WhatsApp</a>
        <a href={mail} onClick={e => { e.stopPropagation(); onClose(); }} style={popItem}>✉️ Email</a>
        <button onClick={e => { e.stopPropagation(); copiarLink(); }} style={{ ...popItem, width: "100%", border: "none", background: "transparent", textAlign: "left" }}>🔗 Copiar link</button>
        <button onClick={e => { e.stopPropagation(); onCopiarTexto(); }} style={{ ...popItem, width: "100%", border: "none", background: "transparent", textAlign: "left" }}>
          {copiado ? "✓ Copiado!" : "📋 Copiar descrição"}
        </button>
      </div>
    </>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { imoveis, loading } = useImoveis();
  const { tipos } = useTipos();
  const [search, setSearch] = useState("");
  const [tipo, setTipo] = useState("Todos");
  const [transacao, setTransacao] = useState("Todos");
  const [valorMin, setValorMin] = useState("");
  const [valorMax, setValorMax] = useState("");
  const [ordem, setOrdem] = useState("recente");
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [shareOpenId, setShareOpenId] = useState(null);
  const [copiadoId, setCopiadoId] = useState(null);

  const publicos = useMemo(() => imoveis.filter(im => statusDoImovel(im) === "Disponível"), [imoveis]);
  const noModo = useMemo(() => publicos.filter(im => matchTransacao(im, transacao)), [publicos, transacao]);

  const filtered = useMemo(() => {
    const q = semAcento(search);
    const vMin = parseFloat(valorMin) || 0;
    const vMax = parseFloat(valorMax) || 0;
    const base = noModo.filter(im => {
      if (q && !(semAcento(im.titulo).includes(q) || semAcento(im.descricao).includes(q) || semAcento(im.cidade).includes(q) || semAcento(im.bairro).includes(q))) return false;
      if (tipo !== "Todos" && im.tipo !== tipo) return false;
      if (vMin > 0 || vMax > 0) {
        const p = precoDoImovel(im);
        if (vMin > 0 && p && p < vMin) return false;
        if (vMax > 0 && p > vMax) return false;
      }
      return true;
    });
    return ordenarImoveis(base, ordem);
  }, [noModo, search, tipo, valorMin, valorMax, ordem]);

  const contagemPorTipo = useMemo(() => {
    const c = {};
    noModo.forEach(im => { if (im.tipo) c[im.tipo] = (c[im.tipo] || 0) + 1; });
    return c;
  }, [noModo]);

  const tiposVisiveis = useMemo(() => {
    return tipos
      .filter(t => (contagemPorTipo[t.nome] || 0) > 0)
      .slice()
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [tipos, contagemPorTipo]);

  const subtituloModo = transacao === "Venda" ? "à venda" : transacao === "Locação" ? "para locação" : "para venda e locação";
  const faixas = transacao === "Locação" ? FAIXAS_LOCACAO : FAIXAS_VENDA;
  const sufixoFaixa = transacao === "Locação" ? "/mês" : "";

  const copiarDescricao = async (im) => {
    try { await navigator.clipboard.writeText(descricaoPronta(im)); setCopiadoId(im.id); setTimeout(() => setCopiadoId(c => (c === im.id ? null : c)), 1800); } catch {
      const ta = document.createElement("textarea"); ta.value = descricaoPronta(im); document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); setCopiadoId(im.id); setTimeout(() => setCopiadoId(c => (c === im.id ? null : c)), 1800); } catch {}
      document.body.removeChild(ta);
    }
    setShareOpenId(null);
  };

  const cardActions = (im) => (
    <>
      <a href={`https://wa.me/${EMPRESA.whatsapp}?text=${encodeURIComponent(`Olá! Tenho interesse no imóvel: ${im.titulo || "imóvel"}\n${window.location.origin}/imovel/${im.id}`)}`}
        target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={waBtnStyle}>💬 WhatsApp</a>
      <div style={{ position: "relative", flex: 1 }} onClick={e => e.stopPropagation()}>
        <button onClick={() => setShareOpenId(shareOpenId === im.id ? null : im.id)} style={compartilharBtnStyle}>
          ↗ Compartilhar
        </button>
        {shareOpenId === im.id && (
          <CompartilharPopup im={im} onCopiarTexto={() => copiarDescricao(im)} copiado={copiadoId === im.id} onClose={() => setShareOpenId(null)} />
        )}
      </div>
    </>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      <style>{`
        .modo-btn { transition: background .18s ease, color .18s ease, box-shadow .2s ease, transform .12s ease; }
        .modo-btn:not(.on):hover { background: rgba(255,255,255,0.10); }
        .tipo-card { transition: background .18s ease, color .18s ease, border-color .18s ease, transform .12s ease, box-shadow .18s ease; }
        .tipo-card:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.10); }
        .tipos-grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
        .tipos-grid > * { flex: 0 0 120px; }
        @media (max-width: 700px) { .tipos-grid > * { flex: 0 0 110px; } }
        @media (max-width: 540px) { .tipos-grid > * { flex: 0 0 calc(25% - 8px); } }
        @media (max-width: 400px) { .tipos-grid > * { flex: 0 0 calc(33.33% - 8px); } }
        .chip { padding: 7px 14px; border-radius: 999px; border: 1px solid var(--border-soft); background: var(--bg-card); color: var(--text-soft); cursor: pointer; font-size: 12.5px; font-weight: 600; }
        .chip.on { background: var(--primary); color: #fff; border-color: var(--primary); }
        .num-input { padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border-soft); background: var(--bg-input); color: var(--text); font-size: 14px; outline: none; width: 100%; box-sizing: border-box; }
        .num-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); }
      `}</style>
      <Header />

      {/* HERO */}
      <div style={{
        position: "relative",
        background: "radial-gradient(120% 130% at 50% -12%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 42%), linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)",
        color: "#fff", padding: "3.5rem 1.5rem 2.5rem", textAlign: "center", borderRadius: "0 0 36px 36px", overflow: "hidden"
      }}>
        <h1 className="display" style={{ margin: "0 0 6px", fontSize: "clamp(32px, 5.4vw, 52px)", fontWeight: 800 }}>Seu imóvel está aqui</h1>
        <p style={{ margin: "0 0 1.4rem", fontSize: 15.5, opacity: 0.92 }}>
          {noModo.length} {noModo.length === 1 ? "imóvel disponível" : "imóveis disponíveis"} {subtituloModo}
        </p>

        {/* Comprar / Alugar / Todos — em destaque */}
        <div style={{ display: "inline-flex", background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.28)", borderRadius: 999, padding: 6, gap: 6, backdropFilter: "blur(6px)" }}>
          {MODOS.map(m => {
            const on = transacao === m.key;
            return (
              <button key={m.key} className={"modo-btn " + (on ? "on" : "")} onClick={() => { setTransacao(m.key); setTipo("Todos"); setValorMin(""); setValorMax(""); }}
                style={{
                  border: "none", cursor: "pointer", borderRadius: 999, padding: "12px 28px", fontSize: 15.5, fontWeight: 800,
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: on ? "#fff" : "transparent", color: on ? "var(--primary-dark)" : "rgba(255,255,255,0.94)",
                  boxShadow: on ? "0 8px 22px rgba(0,0,0,0.22)" : "none"
                }}>
                <span style={{ fontSize: 17 }}>{m.icon}</span>{m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* BUSCA + FILTROS (sai do hero) */}
      <div style={{ maxWidth: 1100, margin: "-28px auto 0", padding: "0 1.5rem", position: "relative", zIndex: 2 }}>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 22, padding: 10, display: "flex", gap: 8, flexWrap: "wrap", boxShadow: "0 18px 44px rgba(0,0,0,0.10)" }}>
          <div style={{ flex: "2 1 240px", display: "flex", alignItems: "center", gap: 8, padding: "0 14px" }}>
            <span style={{ fontSize: 16, opacity: 0.55 }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Bairro, cidade ou palavra-chave"
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 15, color: "var(--text)", padding: "13px 0" }} />
          </div>
          <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch", margin: "6px 0" }} />
          <select value={tipo} onChange={e => setTipo(e.target.value)} style={heroSelectStyle}>
            <option value="Todos">Tipo de imóvel</option>
            {tiposVisiveis.map(t => <option key={t.nome} value={t.nome}>{t.nome}</option>)}
          </select>
          <button onClick={() => setFiltroAberto(o => !o)} style={{ ...heroSelectStyle, flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
            💰 Valor {(valorMin || valorMax) ? "•" : ""}
          </button>
          <button className="btn-grad" onClick={() => document.getElementById("lista-imoveis")?.scrollIntoView({ behavior: "smooth" })}
            style={{ flex: "0 0 auto", padding: "0 26px", borderRadius: 16, fontSize: 18, fontWeight: 700 }}>🔍</button>
        </div>

        {/* Painel de faixa de valor */}
        {filtroAberto && (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 18, padding: 14, marginTop: 10, boxShadow: "0 10px 28px rgba(0,0,0,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <strong style={{ fontSize: 13, color: "var(--text)" }}>Faixa de valor {transacao === "Locação" ? "(aluguel/mês)" : "(venda)"}</strong>
              {(valorMin || valorMax) && <button onClick={() => { setValorMin(""); setValorMax(""); }} style={{ background: "transparent", border: "none", color: "var(--primary)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✕ limpar</button>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={lbl}>De (R$)</label>
                <input className="num-input" type="number" inputMode="numeric" placeholder="0" value={valorMin} onChange={e => setValorMin(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Até (R$)</label>
                <input className="num-input" type="number" inputMode="numeric" placeholder="sem limite" value={valorMax} onChange={e => setValorMax(e.target.value)} />
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <span style={{ fontSize: 11.5, color: "var(--text-muted)", alignSelf: "center", marginRight: 6 }}>Até:</span>
              {faixas.map(v => {
                const on = String(valorMax) === String(v);
                return (
                  <button key={v} className={"chip " + (on ? "on" : "")} onClick={() => { setValorMin(""); setValorMax(v === 0 ? "" : String(v)); }}>
                    {v === 0 ? "Qualquer" : `R$ ${FAIXAS_FMT(v)}${sufixoFaixa}`}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Tipos (quadradinhos pequenos, embaixo da busca) */}
        {tiposVisiveis.length > 0 && (
          <div className="tipos-grid" style={{ marginTop: 14 }}>
            {tiposVisiveis.map(t => {
              const ativo = tipo === t.nome;
              const qtd = contagemPorTipo[t.nome] || 0;
              return (
                <button key={t.nome} className="tipo-card" onClick={() => setTipo(ativo ? "Todos" : t.nome)}
                  style={{
                    background: ativo ? "linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)" : "var(--bg-card)",
                    color: ativo ? "#fff" : "var(--text)",
                    border: `1px solid ${ativo ? "var(--primary)" : "var(--border)"}`,
                    borderRadius: 14, padding: "10px 6px", cursor: "pointer",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                    fontWeight: 600, boxShadow: ativo ? "0 6px 16px rgba(192,57,43,0.25)" : "var(--shadow)"
                  }}>
                  <span style={{ fontSize: 22 }}>{emojiTipo(t.nome)}</span>
                  <span style={{ fontSize: 11.5, textAlign: "center", lineHeight: 1.15, marginTop: 2 }}>{t.nome}</span>
                  <span style={{ fontSize: 10.5, opacity: ativo ? 0.85 : 0.65, fontWeight: 600 }}>{qtd} {qtd === 1 ? "imóvel" : "imóveis"}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* LISTA */}
      <div style={pageWrap(1100)} id="lista-imoveis">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, margin: "1.5rem 0 1.25rem" }}>
          <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
            <b style={{ color: "var(--text)" }}>{filtered.length}</b> {filtered.length === 1 ? "imóvel encontrado" : "imóveis encontrados"}
            {transacao !== "Todos" ? ` · ${transacao === "Venda" ? "Comprar" : "Alugar"}` : ""}
            {tipo !== "Todos" ? ` · ${tipo}` : ""}
            {(valorMin || valorMax) ? ` · R$ ${valorMin || 0} – ${valorMax || "∞"}` : ""}
          </p>
          <select value={ordem} onChange={e => setOrdem(e.target.value)} style={{ padding: "10px 14px", borderRadius: 14, border: "1px solid var(--border-soft)", fontSize: 14, background: "var(--bg-input)", color: "var(--text)", cursor: "pointer" }}>
            {ORDENACOES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>

        {(tipo !== "Todos" || transacao !== "Todos" || search || valorMin || valorMax) && (
          <button onClick={() => { setTipo("Todos"); setTransacao("Todos"); setSearch(""); setValorMin(""); setValorMax(""); }}
            style={{ marginBottom: "1.25rem", padding: "7px 16px", borderRadius: 999, border: "1px solid var(--border-soft)", background: "var(--bg-muted)", color: "var(--text-soft)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>✕ Limpar filtros</button>
        )}

        {loading && <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "4rem 0" }}>Carregando...</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "4rem 0" }}>Nenhum imóvel encontrado com esses filtros.</div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
          {filtered.map(im => (
            <ImovelCard key={im.id} im={im} onClick={() => navigate(`/imovel/${im.id}`)} showStatus={false} actions={cardActions(im)} />
          ))}
        </div>

        <footer style={{ textAlign: "center", padding: "3rem 1rem 1.5rem", color: "var(--text-muted)", fontSize: 12, borderTop: "1px solid var(--border)", marginTop: "2rem" }}>
          <p style={{ margin: "0 0 8px", fontWeight: 600, color: "var(--text-soft)", fontSize: 13 }}>{EMPRESA.nome}</p>
          {EMPRESA.creci && <p style={{ margin: "0 0 4px" }}>{EMPRESA.creci}</p>}
          {EMPRESA.endereco && <p style={{ margin: "0 0 4px" }}>📍 {EMPRESA.endereco}</p>}
          {EMPRESA.telefone && <p style={{ margin: "0 0 4px" }}>📞 {EMPRESA.telefone}</p>}
          <p style={{ margin: "0 0 4px" }}>{EMPRESA.email}{EMPRESA.instagram ? ` • ${EMPRESA.instagram}` : ""}</p>
          <p style={{ margin: "8px 0 0", opacity: 0.7 }}>© {new Date().getFullYear()} {EMPRESA.nome}</p>
        </footer>
      </div>
    </div>
  );
}

const heroSelectStyle = { flex: "1 1 160px", padding: "13px 14px", borderRadius: 14, border: "none", outline: "none", background: "var(--bg-muted)", fontSize: 14.5, color: "var(--text)", cursor: "pointer", fontWeight: 500 };
const waBtnStyle = { flex: 1, padding: "11px 0", fontSize: 13.5, borderRadius: 12, border: "none", background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)", color: "#fff", cursor: "pointer", fontWeight: 700, textAlign: "center", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 };
const compartilharBtnStyle = { width: "100%", padding: "11px 0", fontSize: 13.5, borderRadius: 12, border: "none", background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)", color: "#fff", cursor: "pointer", fontWeight: 700 };
const popItem = { display: "block", padding: "10px 14px", fontSize: 13.5, color: "var(--text)", textDecoration: "none", borderRadius: 10, cursor: "pointer" };
const lbl = { fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 };
