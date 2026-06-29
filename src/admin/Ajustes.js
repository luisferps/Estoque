import { useNavigate } from "react-router-dom";
import { pageWrap } from "../shared/styles";

// Cards de acesso às telas de configuração/manutenção do Estoque.
// Concentra o que não é uso diário, deixando o menu principal limpo.
const ITENS = [
  {
    grupo: "Divulgação",
    cards: [
      { icone: "🔄", nome: "Rotação", desc: "Divulgação automática dos imóveis nos grupos de WhatsApp", path: "/admin/rotacao" },
      { icone: "⭐", nome: "Destaques", desc: "Rodízio das vagas pagas de destaque no Canal Pro", path: "/admin/destaques" },
    ],
  },
  {
    grupo: "Cadastros",
    cards: [
      { icone: "📥", nome: "Importar", desc: "Importação de imóveis em massa via planilha/JSON", path: "/admin/importar" },
      { icone: "🏷️", nome: "Tipos", desc: "Tipos de imóvel e mapeamento para os portais", path: "/admin/tipos" },
      { icone: "👥", nome: "Corretores", desc: "Acesso de contingência (a equipe é gerida no módulo Pessoas)", path: "/admin/corretores" },
    ],
  },
];

export default function Ajustes() {
  const navigate = useNavigate();

  return (
    <div style={pageWrap(900)}>
      <h2 style={{ margin: "0 0 0.3rem", fontSize: 20, fontWeight: 600, color: "var(--primary-dark)" }}>
        ⚙️ Ajustes
      </h2>
      <p style={{ margin: "0 0 1.5rem", fontSize: 13, color: "var(--text-muted)" }}>
        Configurações e ferramentas de manutenção do estoque.
      </p>

      {ITENS.map((secao) => (
        <div key={secao.grupo} style={{ marginBottom: "1.8rem" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            {secao.grupo}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {secao.cards.map((card) => (
              <button
                key={card.path}
                onClick={() => navigate(card.path)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 12, textAlign: "left",
                  padding: "16px 18px", borderRadius: 12, cursor: "pointer",
                  background: "var(--bg-card)", border: "1px solid var(--border-soft)",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.06)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-soft)"; e.currentTarget.style.boxShadow = "none"; }}
              >
                <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>{card.icone}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>{card.nome}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.4 }}>{card.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
