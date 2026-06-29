import { useNavigate } from "react-router-dom";
import { LOGO_URL } from "../constants";

// Cards de acesso às telas de configuração/manutenção do Estoque.
// Concentra o que não é uso diário, deixando o menu principal limpo.
const ITENS = [
  {
    grupo: "Cadastros",
    cards: [
      { icone: "📥", nome: "Importar", desc: "Importação de imóveis em massa via planilha/JSON", path: "/admin/importar" },
      { icone: "🏷️", nome: "Tipos", desc: "Tipos de imóvel e mapeamento para os portais", path: "/admin/tipos" },
    ],
  },
];

export default function Ajustes() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <style>{`
        .aj-nav { position: sticky; top: 0; z-index: 100; background: rgba(255,255,255,0.85); backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px); border-bottom: 1px solid var(--border); }
        .aj-nav-inner { max-width: 900px; margin: 0 auto; height: 54px; padding: 0 20px; display: flex; align-items: center; gap: 14px; }
        .aj-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; padding: 20px; cursor: pointer; transition: transform .25s, box-shadow .25s, border-color .25s; display: flex; align-items: flex-start; gap: 14px; text-align: left; width: 100%; }
        .aj-card:hover { transform: translateY(-3px); box-shadow: 0 12px 26px rgba(0,0,0,0.08); border-color: var(--primary-border); }
      `}</style>

      <nav className="aj-nav">
        <div className="aj-nav-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => navigate("/admin")}>
            <img src={LOGO_URL} alt="Inerente" style={{ height: 24 }} />
            <b style={{ fontSize: 16, fontWeight: 600, color: "var(--primary-dark)" }}>Inerente</b>
          </div>
        </div>
      </nav>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "22px 20px 60px" }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text)" }}>Ajustes</h2>
        <p style={{ margin: "0 0 24px", fontSize: 13.5, color: "var(--text-muted)" }}>
          Configurações e ferramentas de manutenção do estoque.
        </p>

        {ITENS.map((secao) => (
          <div key={secao.grupo} style={{ marginBottom: "1.8rem" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
              {secao.grupo}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
              {secao.cards.map((card) => (
                <button key={card.path} className="aj-card" onClick={() => navigate(card.path)}>
                  <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{card.icone}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>{card.nome}</span>
                    <span style={{ display: "block", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.4 }}>{card.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
