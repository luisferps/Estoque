// Estilos reutilizáveis baseados em CSS variables (suportam dark mode)

export const btnPrimary = {
  background: "var(--primary)", color: "#fff", border: "none",
  borderRadius: 10, padding: "9px 17px", cursor: "pointer",
  fontWeight: 600, fontSize: 14, letterSpacing: "-0.01em",
  transition: "filter .18s ease, transform .12s ease",
};

export const btnOutline = {
  background: "var(--bg-card)", color: "var(--primary)",
  border: "1px solid var(--primary)", borderRadius: 10,
  padding: "8px 15px", cursor: "pointer", fontWeight: 600, fontSize: 13,
  transition: "background .18s ease",
};

export const btnGhost = {
  background: "var(--bg-muted)", color: "var(--text-soft)",
  border: "1px solid var(--border-soft)", borderRadius: 8,
  padding: "6px 11px", cursor: "pointer", fontSize: 12,
  transition: "background .18s ease, color .18s ease",
};

export const inputBase = {
  width: "100%", padding: "10px 13px", borderRadius: 10,
  border: "1px solid var(--border-soft)", fontSize: 14, boxSizing: "border-box",
  background: "var(--bg-input)", color: "var(--text)",
};

export const sectionBox = {
  background: "var(--bg-section)", borderRadius: 14,
  padding: "1rem", marginBottom: "1rem",
  border: "1px solid var(--primary-border)",
};

export const pageWrap = (maxWidth = 900) => ({
  fontFamily: "'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', sans-serif",
  padding: "1rem", maxWidth, margin: "0 auto",
  color: "var(--text)", minHeight: "100vh"
});
