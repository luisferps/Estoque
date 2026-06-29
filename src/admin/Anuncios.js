import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { pageWrap } from "../shared/styles";
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
    <div style={pageWrap(1150)}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "0.8rem", flexWrap: "wrap" }}>
        <button onClick={() => navigate("/admin")} style={backBtn}>← Voltar</button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--primary-dark)", flex: 1 }}>
          📢 Anúncios
        </h2>
      </div>

      {/* Sub-abas */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", marginBottom: "1rem", flexWrap: "wrap" }}>
        {SUBABAS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSub(s.key)}
            style={{
              padding: "10px 18px", border: "none", background: "none", cursor: "pointer",
              fontSize: 14, fontWeight: sub === s.key ? 700 : 500,
              color: sub === s.key ? "var(--primary)" : "var(--text-muted)",
              borderBottom: sub === s.key ? "2px solid var(--primary)" : "2px solid transparent",
              whiteSpace: "nowrap",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Frase-guia da sub-aba atual */}
      <div style={{ background: "var(--bg-section)", borderRadius: 10, padding: "10px 16px", marginBottom: "1.2rem", fontSize: 13, color: "var(--text-soft)", lineHeight: 1.5 }}>
        {atual.guia}
      </div>

      {/* Conteúdo da sub-aba (renderizado em modo embutido) */}
      {sub === "onde" && <OndeAnunciado embutido />}
      {sub === "grupos" && <Rotacao embutido />}
      {sub === "destaques" && <Destaques embutido />}
    </div>
  );
}

const backBtn = { display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", fontSize: 15, cursor: "pointer", color: "var(--primary)", fontWeight: 500, padding: 0 };
