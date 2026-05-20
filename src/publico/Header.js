import { useNavigate } from "react-router-dom";
import { LOGO_URL, EMPRESA } from "../constants";
import { DarkModeToggle } from "../shared/ThemeProvider";

export default function Header() {
  const navigate = useNavigate();
  return (
    <header style={{
      background: "var(--bg-card)", borderBottom: "1px solid var(--border)",
      padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
      flexWrap: "wrap", gap: 10
    }}>
      <div onClick={() => navigate("/")} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
        {LOGO_URL
          ? <img src={LOGO_URL} alt="Logo" style={{ height: 42, objectFit: "contain" }} />
          : <span style={{ fontSize: 28 }}>🏠</span>}
        <div>
          <p style={{ margin: 0, fontWeight: 600, fontSize: 15, color: "var(--text)" }}>{EMPRESA.nome}</p>
          <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>Imóveis para venda e locação</p>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <DarkModeToggle />
        <button onClick={() => navigate("/corretores")} style={{
          padding: "7px 14px", fontSize: 13, borderRadius: 8,
          border: "1px solid var(--border-soft)", background: "var(--bg-muted)",
          color: "var(--text-soft)", cursor: "pointer"
        }}>
          Área do Corretor
        </button>
      </div>
    </header>
  );
}
