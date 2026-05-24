import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useImoveis } from "../shared/hooks";
import { matchTransacao, ordenarImoveis, statusDoImovel, waContatoImovel } from "../shared/utils";
import { pageWrap } from "../shared/styles";
import { EMPRESA, TIPOS, TRANSACOES, ORDENACOES } from "../constants";
import Header from "./Header";
import ImovelCard from "../shared/ImovelCard";

// Ícone (emoji) por tipo de imóvel. Tipos sem mapeamento usam o ícone padrão.
const ICONE_TIPO = {
  "Casa": "🏠",
  "Apartamento": "🏢",
  "Lote": "📐",
  "Área": "🌳",
  "Galpão": "🏭",
};
const ICONE_PADRAO = "🏘️";

export default function Home() {
  const navigate = useNavigate();
  const { imoveis, loading } = useImoveis();
  const [search, setSearch] = useState("");
  const [tipo, setTipo] = useState("Todos");
  const [transacao, setTransacao] = useState("Todos");
  const [ordem, setOrdem] = useState("recente");

  // Site público mostra apenas imóveis "Disponíveis"
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

  // Conta quantos imóveis tem por tipo (pra mostrar nos atalhos)
  const contagemPorTipo = useMemo(() => {
    const c = {};
    publicos.forEach(im => { if (im.tipo) c[im.tipo] = (c[im.tipo] || 0) + 1; });
    return c;
  }, [publicos]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      <Header />

      {/* ─── HERO ─── */}
      <div style={{
        background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)",
        color: "#fff", padding: "3.5rem 1.5rem 3rem", textAlign: "center"
      }}>
        <h1 style={{ margin: "0 0 6px", fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 700, letterSpacing: -1 }}>
          Seu imóvel está aqui
        </h1>
        <p style={{ margin: "0 0 2rem", fontSize: 15, opacity: 0.92 }}>
          {publicos.length} {publicos.length === 1 ? "imóvel disponível" : "imóveis disponíveis"} para venda e locação
        </p>

        {/* ─── BARRA DE BUSCA ─── */}
        <div style={{
          maxWidth: 880, margin: "0 auto",
          background: "var(--bg-card)", borderRadius: 14,
          padding: 8, display: "flex", gap: 8, flexWrap: "wrap",
          boxShadow: "0 12px 40px rgba(0,0,0,0.18)"
        }}>
          <div style={{ flex: "2 1 220px", display: "flex", alignItems: "center", gap: 8, padding: "0 12px" }}>
            <span style={{ fontSize: 16, opacity: 0.5 }}>🔍</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Bairro, cidade ou palavra-chave"
              style={{
                flex: 1, border: "none", outline: "none", background: "transparent",
                fontSize: 15, color: "var(--text)", padding: "12px 0"
              }}
            />
          </div>

          <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch", margin: "6px 0" }} />

          <select value={tipo} onChange={e => setTipo(e.target.value)}
            style={heroSelectStyle}>
            <option value="Todos">Tipo de imóvel</option>
            {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <select value={transacao} onChange={e => setTransacao(e.target.value)}
            style={heroSelectStyle}>
            <option value="Todos">Venda ou Locação</option>
            {TRANSACOES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <button
            onClick={() => document.getElementById("lista-imoveis")?.scrollIntoView({ behavior: "smooth" })}
            style={{
              flex: "0 0 auto", padding: "0 22px",
              background: "var(--primary)", color: "#fff", border: "none",
              borderRadius: 10, fontSize: 18, cursor: "pointer", fontWeight: 600
            }}>
            🔍
          </button>
        </div>

        {/* ─── ATALHOS POR TIPO (dinâmicos) ─── */}
        <div style={{
          display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap",
          maxWidth: 880, margin: "1.5rem auto 0"
        }}>
          {TIPOS.map(t => {
            const ativo = tipo === t;
            return (
              <button key={t}
                onClick={() => { setTipo(ativo ? "Todos" : t); }}
                style={{
                  background: ativo ? "#fff" : "rgba(255,255,255,0.12)",
                  color: ativo ? "var(--primary-dark)" : "#fff",
                  border: ativo ? "2px solid #fff" : "2px solid rgba(255,255,255,0.25)",
                  borderRadius: 12, padding: "12px 18px", cursor: "pointer",
