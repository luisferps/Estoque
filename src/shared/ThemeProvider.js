import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext({ dark: false, toggle: () => {} });

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("theme") === "dark"; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch {}
    const r = document.documentElement.style;
    if (dark) {
      // ── Modo escuro ──
      r.setProperty("--bg", "#1a1a1a");
      r.setProperty("--bg-card", "#262626");
      r.setProperty("--bg-section", "#2d1f1f");
      r.setProperty("--bg-input", "#333");
      r.setProperty("--bg-muted", "#222");
      r.setProperty("--text", "#e8e8e8");
      r.setProperty("--text-muted", "#999");
      r.setProperty("--text-soft", "#aaa");
      r.setProperty("--border", "#3d3d3d");
      r.setProperty("--border-soft", "#444");
      r.setProperty("--primary", "#E74C3C");
      r.setProperty("--primary-dark", "#C0392B");
      r.setProperty("--primary-light", "#3d2020");
      r.setProperty("--primary-border", "#8b3a30");
      r.setProperty("--shadow", "0 1px 6px rgba(0,0,0,0.4)");
      r.setProperty("--gallery-bg", "#0a0a0a");
    } else {
      // ── Modo claro ──
      r.setProperty("--bg", "#ffffff");
      r.setProperty("--bg-card", "#ffffff");
      r.setProperty("--bg-section", "#fdf5f5");
      r.setProperty("--bg-input", "#ffffff");
      r.setProperty("--bg-muted", "#f5f5f5");
      r.setProperty("--text", "#222");
      r.setProperty("--text-muted", "#888");
      r.setProperty("--text-soft", "#666");
      r.setProperty("--border", "#e5e5e5");
      r.setProperty("--border-soft", "#ddd");
      r.setProperty("--primary", "#C0392B");
      r.setProperty("--primary-dark", "#922B21");
      r.setProperty("--primary-light", "#FADBD8");
      r.setProperty("--primary-border", "#E59A94");
      r.setProperty("--shadow", "0 1px 4px rgba(0,0,0,0.06)");
      r.setProperty("--gallery-bg", "#111");
    }
    document.body.style.background = dark ? "#1a1a1a" : "#ffffff";
    document.body.style.color = dark ? "#e8e8e8" : "#222";
    document.body.style.transition = "background 0.2s, color 0.2s";
  }, [dark]);

  return (
    <ThemeContext.Provider value={{ dark, toggle: () => setDark(d => !d) }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function DarkModeToggle({ style }) {
  const { dark, toggle } = useTheme();
  return (
    <button onClick={toggle} title={dark ? "Modo claro" : "Modo escuro"}
      style={{
        background: "var(--bg-muted)", border: "1px solid var(--border-soft)",
        borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 14,
        color: "var(--text)", ...style
      }}>
      {dark ? "☀️" : "🌙"}
    </button>
  );
}
