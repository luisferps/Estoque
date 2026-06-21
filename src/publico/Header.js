import { useNavigate } from "react-router-dom";
import { LOGO_URL, EMPRESA } from "../constants";
import { DarkModeToggle } from "../shared/ThemeProvider";

// Estilos globais do site público — carregados uma vez (entram em qualquer pagina que use Header).
const ESTILO_GLOBAL = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
html, body, input, select, button, textarea {
  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3, .display { font-family: 'Manrope', system-ui, sans-serif; letter-spacing: -0.6px; }
.btn-grad { background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: #fff; border: none; cursor: pointer; transition: filter .15s ease, transform .12s ease; }
.btn-grad:hover { filter: brightness(1.06); }
.btn-wa { background: linear-gradient(135deg, #25D366 0%, #128C7E 100%); color: #fff; border: none; cursor: pointer; transition: filter .15s ease; text-decoration: none; }
.btn-wa:hover { filter: brightness(1.06); }
.card-soft { background: var(--bg-card); border: 1px solid var(--border); border-radius: 18px; box-shadow: 0 2px 10px rgba(0,0,0,0.06); }
.imovel-card { transition: transform .18s ease, box-shadow .18s ease; }
.imovel-card:hover { transform: translateY(-3px); box-shadow: 0 14px 32px rgba(0,0,0,0.14); }
`;

export default function Header({ corretorNovaAba = false }) {
  const navigate = useNavigate();
  const abrirCorretor = () => {
    // "Área do Corretor" leva ao Portal Inerente (porta de entrada de todos os sistemas).
    window.open("https://portalinerente.netlify.app", "_blank", "noopener,noreferrer");
  };
  return (
    <>
      <style>{ESTILO_GLOBAL}</style>
      <header style={{
        background: "var(--bg-card)", borderBottom: "1px solid var(--border)",
        padding: "14px 22px", display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 10, position: "relative", zIndex: 10
      }}>
        <div onClick={() => navigate("/")} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
          {LOGO_URL
            ? <img src={LOGO_URL} alt="Logo" style={{ height: 44, objectFit: "contain" }} />
            : <span style={{ fontSize: 28 }}>🏠</span>}
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15.5, color: "var(--text)", letterSpacing: -0.2 }}>{EMPRESA.nome}</p>
            <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-muted)" }}>Imóveis para venda e locação</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <DarkModeToggle />
          <button onClick={abrirCorretor} style={{
            padding: "8px 16px", fontSize: 13, borderRadius: 12,
            border: "1px solid var(--border-soft)", background: "var(--bg-muted)",
            color: "var(--text-soft)", cursor: "pointer", fontWeight: 600
          }}>
            Área do Corretor
          </button>
        </div>
      </header>
    </>
  );
}
