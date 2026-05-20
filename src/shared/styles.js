// Estilos reutilizáveis baseados em CSS variables (suportam dark mode)

export const btnPrimary = {
  background: "var(--primary)", color: "#fff", border: "none",
  borderRadius: 8, padding: "8px 16px", cursor: "pointer",
  fontWeight: 500, fontSize: 14,
};

export const btnOutline = {
  background: "var(--bg-card)", color: "var(--primary)",
  border: "1px solid var(--primary)", borderRadius: 8,
  padding: "7px 14px", cursor: "pointer", fontWeight: 500, fontSize: 13,
};

export const btnGhost = {
  background: "var(--bg-muted)", color: "var(--text-soft)",
  border: "1px solid var(--border-soft)", borderRadius: 7,
  padding: "5px 10px", cursor: "pointer", fontSize: 12,
};

export const inputBase = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1px solid var(--border-soft)", fontSize: 14, boxSizing: "border-box",
  background: "var(--bg-input)", color: "var(--text)",
};

export const sectionBox = {
  background: "var(--bg-section)", borderRadius: 10,
  padding: "1rem", marginBottom: "1rem",
  border: "1px solid var(--primary-border)",
};

export const pageWrap = (maxWidth = 900) => ({
  fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  padding: "1rem", maxWidth, margin: "0 auto",
  color: "var(--text)", minHeight: "100vh"
});
