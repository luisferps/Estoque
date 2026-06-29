import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LOGO_URL } from "../constants";
import OndeAnunciado from "./OndeAnunciado";
import Rotacao from "./Rotacao";
import Destaques from "./Destaques";

// Aba "Anúncios": concentra tudo sobre divulgação externa dos imóveis.
// 3 sub-abas, cada uma com uma frase que explica pra que serve (linguagem simples).
const SUBABAS = [
  {
    key: "onde",
    label: "Onde está anunciado",
    guia: "Veja em quais sites e canais cada imóvel está sendo anunciado, e resolva o que está faltando.",
  },
  {
    key: "grupos",
    label: "Grupos de WhatsApp",
    guia: "Controle a divulgação automática dos imóveis nos grupos de WhatsApp.",
  },
  {
    key: "destaques",
    label: "Destaque nos portais",
    guia: "Escolha quais imóveis aparecem em posição de destaque nos portais (ZAP, Viva Real, OLX).",
  },
];

export default function Anuncios() {
  const navigate = useNavigate();
  const [sub, setSub] = useState("onde");
  const atual = SUBABAS.find((s) => s.key === sub) || SUBABAS[0];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <style>{`
        .anc-nav { position: sticky; top: 0; z-index: 100; background: rgba(255,255,255,0.85); backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px); border-bottom: 1px solid var(--border); }
        .anc-nav-inner { max-width: 1150px; margin: 0 auto; height: 54px; padding: 0 20px; display: flex; align-items: center; gap: 14px; }
        .anc-subtabs { display: inline-flex; background: var(--bg-muted); padding: 4px; border-radius: 12px; gap: 3px; flex-wrap: wrap; }
        .anc-subtab { padding: 9px 18px; border-radius: 9px; border: none; background: transparent; font-size: 14px; cursor: pointer; font-family: inherit; transition: all .2s; white-space: nowrap; }
      `}</style>

      <nav className="anc-nav">
        <div className="anc-nav-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => navigate("/admin")}>
            <img src={LOGO_URL} alt="Inerente" style={{ height: 24 }} />
            <b style={{ fontSize: 16, fontWeight: 600, color: "var(--primary-dark)" }}>Inerente</b>
          </div>
        </div>
      </nav>

      <div style={{ maxWidth: 1150, margin: "0 auto", padding: "22px 20px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "1.25rem" }}>
          <button onClick={() => navigate("/admin")} style={backBtn}>← Voltar</button>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text)" }}>Anúncios</h2>
        </div>

        {/* Sub-abas (segmented control) */}
        <div className="anc-subtabs" style={{ marginBottom: 10 }}>
          {SUBABAS.map((s) => {
            const on = sub === s.key;
            return (
              <button key={s.key} className="anc-subtab" onClick={() => setSub(s.key)}
                style={{
                  background: on ? "var(--bg-card)" : "transparent",
                  color: on ? "var(--primary-dark)" : "var(--text-soft)",
                  fontWeight: on ? 600 : 500,
                  boxShadow: on ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                }}>
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Frase-guia */}
        <p style={{ fontSize: 13.5, color: "var(--text-muted)", margin: "0 0 20px", lineHeight: 1.5 }}>{atual.guia}</p>

        {/* Conteúdo da sub-aba (modo embutido) */}
        {sub === "onde" && <OndeAnunciado embutido />}
        {sub === "grupos" && <Rotacao embutido />}
        {sub === "destaques" && <Destaques embutido />}
      </div>
    </div>
  );
}

const backBtn = { display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", fontSize: 14, cursor: "pointer", color: "var(--primary)", fontWeight: 500, padding: 0 };
