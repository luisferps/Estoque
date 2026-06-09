import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useImoveis, useTipos } from "../shared/hooks";
import { matchTransacao, ordenarImoveis, statusDoImovel, waContatoImovel, descricaoPronta } from "../shared/utils";
import { pageWrap } from "../shared/styles";
import { EMPRESA, TRANSACOES, ORDENACOES } from "../constants";
import Header from "./Header";
import ImovelCard from "../shared/ImovelCard";

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

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const base = publicos.filter(im =>
      (!q || (im.titulo || "").toLowerCase().includes(q) || (im.descricao || "").toLowerCase().includes(q) || (im.cidade || "").toLowerCase().includes(q) || (im.bairro || "").toLowerCase().includes(q))
      && (tipo === "Todos" || im.tipo === tipo)
      && matchTransacao(im, transacao)
    );
    return ordenarImoveis(base, ordem);
  }, [publicos, search, tipo, transacao, ordem]);

  const contagemPorTipo = useMemo(() => {
    const c = {};
    publicos.forEach(im => { if (im.tipo) c[im.tipo] = (c[im.tipo] || 0) + 1; });
    return c;
  }, [publicos]);

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
      <Header />

      <div style={{ background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)", color: "#fff", padding: "3.5rem 1.5rem 3rem", textAlign: "center" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 700, letterSpacing: -1 }}>Seu imóvel está aqui</h1>
        <p style={{ margin: "0 0 2rem", fontSize: 15, opacity: 0.92 }}>
          {publicos.length} {publicos.length === 1 ? "imóvel disponível" : "imóveis disponíveis"} para venda e locação
        </p>

        <div style={{ maxWidth: 880, margin: "0 auto", background: "var(--bg-card)", borderRadius: 14, padding: 8, display: "flex", gap: 8, flexWrap: "wrap", boxShadow: "0 12px 40px rgba(0,0,0,0.18)" }}>
          <div style={{ flex: "2 1 220px", display: "flex", alignItems: "center", gap: 8, padding: "0 12px" }}>
            <span style={{ fontSize: 16, opacity: 0.5 }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Bairro, cidade ou palavra-chave" style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 15, color: "var(--text)", padding: "12px 0" }} />
          </div>
          <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch", margin: "6px 0" }} />
          <select value={tipo} onChange={e => setTipo(e.target.value)} style={heroSelectStyle}>
            <option value="Todos">Tipo de imóvel</option>
            {tipos.map(t => <option key={t.nome} value={t.nome}>{t.nome}</option>)}
          </select>
          <select value={transacao} onChange={e => setTransacao(e.target.value)} style={heroSelectStyle}>
            <option value="Todos">Venda ou Locação</option>
            {TRANSACOES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={() => document.getElementById("lista-imoveis")?.scrollIntoView({ behavior: "smooth" })} style={{ flex: "0 0 auto", padding: "0 22px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: 10, fontSize: 18, cursor: "pointer", fontWeight: 600 }}>🔍</button>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", maxWidth: 880, margin: "1.5rem auto 0" }}>
          {tipos.map(t => {
            const ativo = tipo === t.nome;
            return (
              <button key={t.nome} onClick={() => setTipo(ativo ? "Todos" : t.nome)} style={{ background: ativo ? "#fff" : "rgba(255,255,255,0.12)", color: ativo ? "var(--primary-dark)" : "#fff", border: ativo ? "2px solid #fff" : "2px solid rgba(255,255,255,0.25)", borderRadius: 12, padding: "12px 18px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 92, fontWeight: 600 }}>
                <span style={{ fontSize: 26 }}>{t.icone || "🏘️"}</span>
                <span style={{ fontSize: 13 }}>{t.nome}</span>
                <span style={{ fontSize: 11, opacity: 0.75 }}>{contagemPorTipo[t.nome] || 0} {contagemPorTipo[t.nome] === 1 ? "imóvel" : "imóveis"}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={pageWrap(1100)} id="lista-imoveis">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: "1rem" }}>
          <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
            {filtered.length} {filtered.length === 1 ? "imóvel encontrado" : "imóveis encontrados"}
            {tipo !== "Todos" ? ` · ${tipo}` : ""}
            {transacao !== "Todos" ? ` · ${transacao}` : ""}
          </p>
          <select value={ordem} onChange={e => setOrdem(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-soft)", fontSize: 14, background: "var(--bg-input)", color: "var(--text)" }}>
            {ORDENACOES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>

        {(tipo !== "Todos" || transacao !== "Todos" || search) && (
          <button onClick={() => { setTipo("Todos"); setTransacao("Todos"); setSearch(""); }} style={{ marginBottom: "1rem", padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-muted)", color: "var(--text-soft)", cursor: "pointer", fontSize: 13 }}>✕ Limpar filtros</button>
        )}

        {loading && <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "4rem 0" }}>Carregando...</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "4rem 0" }}>Nenhum imóvel encontrado com esses filtros.</div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
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

const heroSelectStyle = { flex: "1 1 150px", padding: "12px 10px", borderRadius: 10, border: "none", outline: "none", background: "var(--bg-muted)", fontSize: 14, color: "var(--text)", cursor: "pointer" };
const waBtnStyle = { flex: "1 1 100%", padding: "8px 0", fontSize: 13, borderRadius: 7, border: "none", background: "#25D366", color: "#fff", cursor: "pointer", fontWeight: 600, textAlign: "center", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 };
const verBtnStyle = { flex: 1, padding: "8px 0", fontSize: 13, borderRadius: 7, border: "1px solid var(--primary)", background: "var(--bg-card)", color: "var(--primary)", cursor: "pointer", fontWeight: 500 };
const copiarBtnStyle = { flex: 1, padding: "8px 0", fontSize: 13, borderRadius: 7, border: "1px solid var(--border-soft)", background: "var(--bg-muted)", color: "var(--text)", cursor: "pointer", fontWeight: 500 };
