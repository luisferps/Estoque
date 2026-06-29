import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useImoveis, useTipos } from "../shared/hooks";
import { matchTransacao, ordenarImoveis, statusDoImovel, descricaoPronta, linkLocalizacao } from "../shared/utils";
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
  // Link de localização (pino + satélite), sempre a partir da coordenada atual.
  const mapsLink = linkLocalizacao(im);
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
        {mapsLink && <a href={mapsLink} target="_blank" rel="noreferrer" onClick={e => { e.stopPropagation(); onClose(); }} style={popItem}>📍 Localização no mapa</a>}
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

  // Reveal-on-scroll: observa elementos com .reveal e adiciona .on quando entram no viewport.
  // Roda toda vez que a lista de imóveis muda (pra pegar os cards novos sem reanimar os antigos).
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    const els = document.querySelectorAll(".reveal:not(.on)");
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add("on"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [imoveis, transacao, tipo, search, valorMin, valorMax, ordem, filtroAberto]);
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
        target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ ...waBtnStyle, minWidth: 0, flex: 1 }}>💬 WhatsApp</a>
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
        .reveal { opacity: 0; transform: translateY(40px); transition: opacity .7s cubic-bezier(.22,.61,.36,1), transform .7s cubic-bezier(.22,.61,.36,1); will-change: opacity, transform; }
        .reveal.on { opacity: 1; transform: translateY(0); }
        @media (prefers-reduced-motion: reduce) { .reveal { opacity: 1; transform: none; transition: none; } }
        .h-tab { transition: all .25s ease; }
        .h-tab:not(.on):hover { background: rgba(255,255,255,0.12); }
        .h-tipo { transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease; }
        .h-tipo:hover { transform: translateY(-4px); box-shadow: 0 12px 26px rgba(0,0,0,0.09); border-color: var(--primary-border); }
        .h-tipo.on { border-color: var(--primary); box-shadow: 0 8px 22px rgba(192,57,43,0.18); }
        .num-input { padding: 11px 13px; border-radius: 12px; border: 1px solid var(--border-soft); background: var(--bg-input); color: var(--text); font-size: 14px; outline: none; width: 100%; box-sizing: border-box; }
        .num-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); }
        .chip { padding: 8px 16px; border-radius: 999px; border: 1px solid var(--border-soft); background: var(--bg-card); color: var(--text-soft); cursor: pointer; font-size: 12.5px; font-weight: 500; transition: all .2s; }
        .chip:hover { border-color: var(--primary-border); color: var(--primary); }
        .chip.on { background: var(--primary); color: #fff; border-color: var(--primary); }
        .wa-float { position: fixed; bottom: 24px; right: 24px; z-index: 200; display: flex; align-items: center; gap: 9px; background: #25D366; color: #fff; border-radius: 999px; padding: 13px 22px 13px 18px; box-shadow: 0 6px 22px rgba(37,211,102,0.45); text-decoration: none; transition: transform .2s, box-shadow .2s; white-space: nowrap; }
        .wa-float:hover { transform: scale(1.04); box-shadow: 0 8px 28px rgba(37,211,102,0.55); }
        @media (max-width: 540px) { .wa-float { bottom: 18px; right: 18px; padding: 13px 18px; } .wa-float .wa-txt { display: none; } }
      `}</style>

      <Header corretorNovaAba />

      {/* HERO vermelho: abas + busca */}
      <div style={{
        background: "linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 60%, #cf4636 100%)",
        color: "#fff", padding: "44px 1.5rem 52px", textAlign: "center"
      }}>
        {/* Abas Todos / Comprar / Alugar */}
        <div style={{ maxWidth: "100%", overflowX: "auto", scrollbarWidth: "none" }}>
          <div style={{ display: "inline-flex", background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.26)", borderRadius: 999, padding: 5, gap: 4, backdropFilter: "blur(8px)", whiteSpace: "nowrap" }}>
            {MODOS.map(m => {
              const on = transacao === m.key;
              return (
                <button key={m.key} className={"h-tab " + (on ? "on" : "")} onClick={() => { setTransacao(m.key); setTipo("Todos"); setValorMin(""); setValorMax(""); }}
                  style={{
                    border: "none", cursor: "pointer", borderRadius: 999, padding: "10px clamp(16px, 4vw, 26px)", fontSize: "clamp(13px, 3.5vw, 15px)", fontWeight: 600,
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: on ? "#fff" : "transparent", color: on ? "var(--primary-dark)" : "rgba(255,255,255,0.92)",
                    boxShadow: on ? "0 2px 8px rgba(0,0,0,0.14)" : "none", flexShrink: 0
                  }}>
                  <span style={{ fontSize: "clamp(14px, 4vw, 16px)" }}>{m.icon}</span>{m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Barra de busca */}
        <div style={{ maxWidth: 860, margin: "26px auto 0", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: "#fff", border: "1px solid var(--border)", borderRadius: 999, padding: "7px 7px 7px 22px", boxShadow: "0 8px 30px rgba(0,0,0,0.16)" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Bairro, cidade ou palavra-chave"
            style={{ flex: "1 1 180px", border: "none", outline: "none", fontSize: 15, color: "var(--text)", background: "transparent", minWidth: 80 }} />
          <select value={tipo} onChange={e => setTipo(e.target.value)}
            style={{ border: "none", outline: "none", background: "var(--bg-muted)", borderRadius: 999, padding: "11px 16px", fontSize: 14, color: "var(--text-soft)", cursor: "pointer", fontFamily: "inherit" }}>
            <option value="Todos">Tipo de imóvel</option>
            {tiposVisiveis.map(t => <option key={t.nome} value={t.nome}>{t.nome}</option>)}
          </select>
          <button onClick={() => setFiltroAberto(o => !o)}
            style={{ border: "none", background: filtroAberto ? "var(--primary-light)" : "var(--bg-muted)", color: filtroAberto ? "var(--primary-dark)" : "var(--text-soft)", borderRadius: 999, padding: "11px 18px", fontSize: 14, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit", fontWeight: 500 }}>
            💰 Valor
          </button>
          <button onClick={() => document.getElementById("lista-imoveis")?.scrollIntoView({ behavior: "smooth" })}
            style={{ background: "var(--primary)", color: "#fff", border: "none", borderRadius: 999, padding: "11px 22px", fontSize: 16, fontWeight: 500, cursor: "pointer" }}>🔍</button>
        </div>

        {/* Painel de faixa de valor (abre ao clicar em Valor) */}
        {filtroAberto && (
          <div style={{ maxWidth: 860, margin: "10px auto 0", background: "#fff", borderRadius: 18, padding: 16, boxShadow: "0 10px 28px rgba(0,0,0,0.12)", textAlign: "left", color: "var(--text)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Faixa de preço{sufixoFaixa ? " (mensal)" : ""}</span>
              {(valorMin || valorMax) && <button onClick={() => { setValorMin(""); setValorMax(""); }} style={{ background: "transparent", border: "none", color: "var(--primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>✕ limpar</button>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <span style={lbl}>Mínimo (R$)</span>
                <input className="num-input" type="number" inputMode="numeric" placeholder="0" value={valorMin} onChange={e => setValorMin(e.target.value)} />
              </div>
              <div>
                <span style={lbl}>Máximo (R$)</span>
                <input className="num-input" type="number" inputMode="numeric" placeholder="sem limite" value={valorMax} onChange={e => setValorMax(e.target.value)} />
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {faixas.map(v => {
                const on = v === 0 ? (!valorMax) : (String(v) === valorMax);
                return (
                  <button key={v} className={"chip " + (on ? "on" : "")} onClick={() => { setValorMin(""); setValorMax(v === 0 ? "" : String(v)); }}>
                    {v === 0 ? "Qualquer" : `até R$ ${FAIXAS_FMT(v)}${sufixoFaixa}`}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* GRADE DE TIPOS (atalhos) */}
      {tiposVisiveis.length > 0 && (
        <div style={{ maxWidth: 1024, margin: "40px auto 0", padding: "0 1.5rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(116px, 1fr))", gap: 12 }}>
            {tiposVisiveis.map(t => {
              const ativo = tipo === t.nome;
              return (
                <button key={t.nome} className={"h-tipo " + (ativo ? "on" : "")} onClick={() => setTipo(ativo ? "Todos" : t.nome)}
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, padding: "18px 10px 14px", textAlign: "center", cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.03)" }}>
                  <div style={{ fontSize: 30, lineHeight: 1, marginBottom: 10 }}>{emojiTipo(t.nome)}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: ativo ? "var(--primary)" : "var(--text)", lineHeight: 1.25 }}>{t.nome}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* LISTA DE IMÓVEIS */}
      <div style={{ maxWidth: 1024, margin: "0 auto", padding: "56px 1.5rem 0" }} id="lista-imoveis">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
          <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
            <b style={{ color: "var(--text)", fontWeight: 600 }}>{filtered.length}</b> {filtered.length === 1 ? "imóvel encontrado" : "imóveis encontrados"}
            {transacao !== "Todos" ? ` · ${transacao === "Venda" ? "Comprar" : "Alugar"}` : ""}
            {tipo !== "Todos" ? ` · ${tipo}` : ""}
          </p>
          <select value={ordem} onChange={e => setOrdem(e.target.value)}
            style={{ padding: "10px 18px", borderRadius: 999, border: "1px solid var(--border)", fontSize: 14, background: "var(--bg-card)", color: "var(--text)", cursor: "pointer", fontFamily: "inherit" }}>
            {ORDENACOES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>

        {(tipo !== "Todos" || transacao !== "Todos" || search || valorMin || valorMax) && (
          <button onClick={() => { setTipo("Todos"); setTransacao("Todos"); setSearch(""); setValorMin(""); setValorMax(""); }}
            style={{ marginBottom: 24, padding: "8px 16px", borderRadius: 999, border: "1px solid var(--border-soft)", background: "var(--bg-muted)", color: "var(--text-soft)", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>✕ Limpar filtros</button>
        )}

        {loading && <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "4rem 0" }}>Carregando...</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "4rem 0" }}>Nenhum imóvel encontrado com esses filtros.</div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 24 }}>
          {filtered.map((im, i) => (
            <div key={im.id} className="reveal" style={{ transitionDelay: `${Math.min((i % 6) * 70, 350)}ms` }}>
              <ImovelCard im={im} onClick={() => navigate(`/imovel/${im.id}`)} showStatus={false} actions={cardActions(im)} />
            </div>
          ))}
        </div>
      </div>

      {/* BANNER captação */}
      <div style={{ background: "var(--bg-section)", textAlign: "center", padding: "72px 1.5rem", marginTop: 72 }}>
        <h2 style={{ fontSize: "clamp(26px, 4vw, 36px)", fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 12, color: "var(--text)" }}>Quer anunciar seu imóvel?</h2>
        <p style={{ color: "var(--text-soft)", fontSize: 17, maxWidth: 520, margin: "0 auto 26px" }}>A Inerente cuida de tudo: fotos, anúncios nos portais, divulgação e negociação.</p>
        <a href={`https://wa.me/${EMPRESA.whatsapp}?text=${encodeURIComponent("Olá! Quero anunciar meu imóvel com a Inerente.")}`} target="_blank" rel="noreferrer"
          style={{ display: "inline-block", background: "var(--primary)", color: "#fff", padding: "14px 34px", borderRadius: 999, fontSize: 15, fontWeight: 500, textDecoration: "none" }}>Falar com um corretor</a>
      </div>

      {/* RODAPÉ */}
      <footer style={{ background: "var(--bg-card)", borderTop: "1px solid var(--border)", padding: "48px 1.5rem 36px" }}>
        <div style={{ maxWidth: 1024, margin: "0 auto" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "20px 56px", justifyContent: "center", marginBottom: 28, textAlign: "center" }}>
            <div>
              <h4 style={footColH}>Contato</h4>
              {EMPRESA.telefone && <a href={`https://wa.me/${EMPRESA.whatsapp}`} target="_blank" rel="noreferrer" style={footLink}>{EMPRESA.telefone} · WhatsApp</a>}
              {EMPRESA.email && <a href={`mailto:${EMPRESA.email}`} style={footLink}>{EMPRESA.email}</a>}
              {EMPRESA.instagram && <a href={`https://instagram.com/${EMPRESA.instagram.replace("@", "")}`} target="_blank" rel="noreferrer" style={footLink}>{EMPRESA.instagram}</a>}
            </div>
            {EMPRESA.endereco && (
              <div>
                <h4 style={footColH}>Endereço</h4>
                <p style={footLink}>📍 {EMPRESA.endereco}</p>
              </div>
            )}
          </div>
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 22, display: "flex", justifyContent: "center", alignItems: "center", gap: 14, flexWrap: "wrap", textAlign: "center" }}>
            {EMPRESA.creci && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--primary-dark)", background: "var(--bg-card)", border: "1px solid var(--primary-border)", padding: "6px 14px", borderRadius: 8 }}>{EMPRESA.creci}</span>}
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>© {new Date().getFullYear()} {EMPRESA.nome}</p>
          </div>
        </div>
      </footer>

      {/* WHATSAPP FLUTUANTE */}
      <a href={`https://wa.me/${EMPRESA.whatsapp}?text=${encodeURIComponent("Olá! Vi um imóvel no site e gostaria de mais informações.")}`} target="_blank" rel="noreferrer" className="wa-float" aria-label="Falar no WhatsApp">
        <span style={{ fontSize: 22, lineHeight: 1 }}>💬</span>
        <span className="wa-txt" style={{ fontSize: 14, fontWeight: 600 }}>Fale conosco no WhatsApp</span>
      </a>
    </div>
  );
}

const footColH = { fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 };
const footLink = { display: "block", fontSize: 13, color: "var(--text-soft)", textDecoration: "none", marginBottom: 5, lineHeight: 1.5 };

const waBtnStyle = { flex: 1, padding: "11px 0", fontSize: 13.5, borderRadius: 12, border: "none", background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)", color: "#fff", cursor: "pointer", fontWeight: 700, textAlign: "center", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 };
const compartilharBtnStyle = { width: "100%", padding: "11px 0", fontSize: 13.5, borderRadius: 12, border: "none", background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)", color: "#fff", cursor: "pointer", fontWeight: 700 };
const popItem = { display: "block", padding: "10px 14px", fontSize: 13.5, color: "var(--text)", textDecoration: "none", borderRadius: 10, cursor: "pointer" };
const lbl = { fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 };
