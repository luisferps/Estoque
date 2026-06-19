import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useImoveis, useTipos } from "../shared/hooks";
import { matchTransacao, ordenarImoveis, statusDoImovel, waContatoImovel, descricaoPronta } from "../shared/utils";
import { pageWrap } from "../shared/styles";
import { EMPRESA, ORDENACOES } from "../constants";
import Header from "./Header";
import ImovelCard from "../shared/ImovelCard";

// Remove acentos e baixa caixa — pra busca não diferenciar "São" de "sao".
const semAcento = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Emoji por tipo de imóvel (casa o nome, sem acento). Cai no padrão 🏘️ se não achar.
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

// Separação Comprar / Alugar / Todos. "Comprar" usa "Venda" no matchTransacao.
const MODOS = [
  { key: "Todos", label: "Todos", icon: "🏘️" },
  { key: "Venda", label: "Comprar", icon: "🔑" },
  { key: "Locação", label: "Alugar", icon: "🗓️" },
];

export default function Home() {
  const navigate = useNavigate();
  const { imoveis, loading } = useImoveis();
  const { tipos } = useTipos();
  const [search, setSearch] = useState("");
  const [tipo, setTipo] = useState("Todos");
  const [transacao, setTransacao] = useState("Todos");
  const [ordem, setOrdem] = useState("recente");
  const [copiadoId, setCopiadoId] = useState(null);

  const publicos = useMemo(() => imoveis.filter(im => statusDoImovel(im) === "Disponível"), [imoveis]);

  // Imóveis dentro do modo escolhido (Comprar/Alugar/Todos) — base das contagens e da lista.
  const noModo = useMemo(() => publicos.filter(im => matchTransacao(im, transacao)), [publicos, transacao]);

  const filtered = useMemo(() => {
    const q = semAcento(search);
    const base = noModo.filter(im =>
      (!q || semAcento(im.titulo).includes(q) || semAcento(im.descricao).includes(q) || semAcento(im.cidade).includes(q) || semAcento(im.bairro).includes(q))
      && (tipo === "Todos" || im.tipo === tipo)
    );
    return ordenarImoveis(base, ordem);
  }, [noModo, search, tipo, ordem]);

  const contagemPorTipo = useMemo(() => {
    const c = {};
    noModo.forEach(im => { if (im.tipo) c[im.tipo] = (c[im.tipo] || 0) + 1; });
    return c;
  }, [noModo]);

  // Só os tipos com pelo menos 1 imóvel no modo atual, em ordem alfabética.
  const tiposVisiveis = useMemo(() => {
    return tipos
      .filter(t => (contagemPorTipo[t.nome] || 0) > 0)
      .slice()
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [tipos, contagemPorTipo]);

  const subtituloModo = transacao === "Venda" ? "à venda" : transacao === "Locação" ? "para locação" : "para venda e locação";

  const copiarImovel = async (im) => {
    const texto = descricaoPronta(im);
    try {
      await navigator.clipboard.writeText(texto);
      setCopiadoId(im.id);
      setTimeout(() => setCopiadoId(c => (c === im.id ? null : c)), 2500);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = texto; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); setCopiadoId(im.id); setTimeout(() => setCopiadoId(c => (c === im.id ? null : c)), 2500); } catch {}
      document.body.removeChild(ta);
    }
  };

  const cardActions = (im) => (
    <div style={{ display: "flex", gap: 6, width: "100%", flexWrap: "wrap" }}>
      <a href={waContatoImovel(im, EMPRESA.whatsapp)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={waBtnStyle}>💬 WhatsApp</a>
      <button onClick={e => { e.stopPropagation(); navigate(`/imovel/${im.id}`); }} style={verBtnStyle}>Ver detalhes</button>
      <button onClick={e => { e.stopPropagation(); copiarImovel(im); }} style={copiarBtnStyle}>
        {copiadoId === im.id ? "✓ Copiado!" : "📋 Copiar"}
      </button>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      <style>{`
        .tipo-card { transition: transform .16s ease, box-shadow .16s ease; }
        .tipo-card:hover { transform: translateY(-3px); box-shadow: 0 12px 28px rgba(0,0,0,0.22); }
        .modo-btn { transition: background .18s ease, color .18s ease, box-shadow .18s ease; }
        .hero-search { transition: box-shadow .2s ease; }
        .hero-search:focus-within { box-shadow: 0 18px 52px rgba(0,0,0,0.30); }
        .hero-go:hover { filter: brightness(1.06); }
        .chip-clear:hover { background: var(--bg-card); }
      `}</style>
      <Header />

      <div style={{
        position: "relative",
        background: "radial-gradient(120% 130% at 50% -12%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 42%), linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)",
        color: "#fff", padding: "3.5rem 1.5rem 3.25rem", textAlign: "center", borderRadius: "0 0 34px 34px", overflow: "hidden"
      }}>
        <h1 style={{ margin: "0 0 8px", fontSize: "clamp(30px, 5.2vw, 48px)", fontWeight: 800, letterSpacing: -1.2 }}>Seu imóvel está aqui</h1>
        <p style={{ margin: "0 0 1.6rem", fontSize: 15.5, opacity: 0.92 }}>
          {noModo.length} {noModo.length === 1 ? "imóvel disponível" : "imóveis disponíveis"} {subtituloModo}
        </p>

        {/* Comprar / Alugar / Todos */}
        <div style={{ display: "inline-flex", background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.24)", borderRadius: 999, padding: 5, gap: 4, marginBottom: "1.6rem", backdropFilter: "blur(6px)" }}>
          {MODOS.map(m => {
            const on = transacao === m.key;
            return (
              <button key={m.key} className="modo-btn" onClick={() => { setTransacao(m.key); setTipo("Todos"); }}
                style={{
                  border: "none", cursor: "pointer", borderRadius: 999, padding: "9px 20px", fontSize: 14, fontWeight: 700,
                  display: "inline-flex", alignItems: "center", gap: 7,
                  background: on ? "#fff" : "transparent", color: on ? "var(--primary-dark)" : "rgba(255,255,255,0.92)",
                  boxShadow: on ? "0 6px 16px rgba(0,0,0,0.20)" : "none"
                }}>
                <span style={{ fontSize: 15 }}>{m.icon}</span>{m.label}
              </button>
            );
          })}
        </div>

        {/* Busca */}
        <div className="hero-search" style={{ maxWidth: 880, margin: "0 auto", background: "var(--bg-card)", borderRadius: 20, padding: 8, display: "flex", gap: 8, flexWrap: "wrap", boxShadow: "0 14px 42px rgba(0,0,0,0.22)" }}>
          <div style={{ flex: "2 1 220px", display: "flex", alignItems: "center", gap: 8, padding: "0 14px" }}>
            <span style={{ fontSize: 16, opacity: 0.5 }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Bairro, cidade ou palavra-chave" style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 15, color: "var(--text)", padding: "13px 0" }} />
          </div>
          <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch", margin: "6px 0" }} />
          <select value={tipo} onChange={e => setTipo(e.target.value)} style={heroSelectStyle}>
            <option value="Todos">Tipo de imóvel</option>
            {tiposVisiveis.map(t => <option key={t.nome} value={t.nome}>{t.nome}</option>)}
          </select>
          <button className="hero-go" onClick={() => document.getElementById("lista-imoveis")?.scrollIntoView({ behavior: "smooth" })} style={{ flex: "0 0 auto", padding: "0 24px", background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)", color: "#fff", border: "none", borderRadius: 14, fontSize: 18, cursor: "pointer", fontWeight: 600 }}>🔍</button>
        </div>

        {tiposVisiveis.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(104px, 1fr))", gap: 12, maxWidth: 880, margin: "1.75rem auto 0" }}>
            {tiposVisiveis.map(t => {
              const ativo = tipo === t.nome;
              const qtd = contagemPorTipo[t.nome] || 0;
              return (
                <button key={t.nome} className="tipo-card" onClick={() => setTipo(ativo ? "Todos" : t.nome)}
                  style={{
                    background: ativo ? "#fff" : "linear-gradient(160deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.06) 100%)",
                    color: ativo ? "var(--primary-dark)" : "#fff",
                    border: ativo ? "2px solid #fff" : "1px solid rgba(255,255,255,0.28)",
                    borderRadius: 18, padding: "16px 8px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, fontWeight: 700,
                    backdropFilter: "blur(4px)", boxShadow: ativo ? "0 8px 22px rgba(0,0,0,0.20)" : "none"
                  }}>
                  <span style={{ fontSize: 28 }}>{emojiTipo(t.nome)}</span>
                  <span style={{ fontSize: 13, textAlign: "center", lineHeight: 1.15 }}>{t.nome}</span>
                  <span style={{ fontSize: 11, opacity: ativo ? 0.6 : 0.82, fontWeight: 600 }}>{qtd} {qtd === 1 ? "imóvel" : "imóveis"}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={pageWrap(1100)} id="lista-imoveis">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, margin: "0.5rem 0 1.25rem" }}>
          <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
            <b style={{ color: "var(--text)" }}>{filtered.length}</b> {filtered.length === 1 ? "imóvel encontrado" : "imóveis encontrados"}
            {transacao !== "Todos" ? ` · ${transacao === "Venda" ? "Comprar" : "Alugar"}` : ""}
            {tipo !== "Todos" ? ` · ${tipo}` : ""}
          </p>
          <select value={ordem} onChange={e => setOrdem(e.target.value)} style={{ padding: "9px 14px", borderRadius: 12, border: "1px solid var(--border-soft)", fontSize: 14, background: "var(--bg-input)", color: "var(--text)", cursor: "pointer" }}>
            {ORDENACOES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>

        {(tipo !== "Todos" || transacao !== "Todos" || search) && (
          <button className="chip-clear" onClick={() => { setTipo("Todos"); setTransacao("Todos"); setSearch(""); }} style={{ marginBottom: "1.25rem", padding: "7px 16px", borderRadius: 999, border: "1px solid var(--border-soft)", background: "var(--bg-muted)", color: "var(--text-soft)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>✕ Limpar filtros</button>
        )}

        {loading && <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "4rem 0" }}>Carregando...</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "4rem 0" }}>Nenhum imóvel encontrado com esses filtros.</div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 18 }}>
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

const heroSelectStyle = { flex: "1 1 150px", padding: "13px 12px", borderRadius: 14, border: "none", outline: "none", background: "var(--bg-muted)", fontSize: 14, color: "var(--text)", cursor: "pointer" };
const waBtnStyle = { flex: "1 1 100%", padding: "9px 0", fontSize: 13, borderRadius: 10, border: "none", background: "#25D366", color: "#fff", cursor: "pointer", fontWeight: 600, textAlign: "center", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 };
const verBtnStyle = { flex: 1, padding: "9px 0", fontSize: 13, borderRadius: 10, border: "1px solid var(--primary)", background: "var(--bg-card)", color: "var(--primary)", cursor: "pointer", fontWeight: 500 };
const copiarBtnStyle = { flex: 1, padding: "9px 0", fontSize: 13, borderRadius: 10, border: "1px solid var(--border-soft)", background: "var(--bg-muted)", color: "var(--text)", cursor: "pointer", fontWeight: 500 };
