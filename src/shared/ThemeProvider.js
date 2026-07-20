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
      // ── Modo escuro (dark premium — terracota) ──
      r.setProperty("--bg", "oklch(0.19 0.008 38)");
      r.setProperty("--bg-card", "oklch(0.235 0.009 38)");
      r.setProperty("--bg-section", "oklch(0.25 0.02 30)");
      r.setProperty("--bg-input", "oklch(0.26 0.009 38)");
      r.setProperty("--bg-muted", "oklch(0.22 0.008 38)");
      r.setProperty("--text", "oklch(0.95 0.005 40)");
      r.setProperty("--text-muted", "oklch(0.68 0.012 40)");
      r.setProperty("--text-soft", "oklch(0.76 0.012 40)");
      r.setProperty("--border", "oklch(0.31 0.01 38)");
      r.setProperty("--border-soft", "oklch(0.35 0.01 38)");
      r.setProperty("--primary", "oklch(0.66 0.17 30)");
      r.setProperty("--primary-dark", "oklch(0.74 0.15 33)");
      r.setProperty("--primary-light", "oklch(0.30 0.045 30)");
      r.setProperty("--primary-border", "oklch(0.45 0.09 30)");
      r.setProperty("--shadow", "0 2px 8px rgba(0,0,0,0.45), 0 14px 34px -18px rgba(0,0,0,0.55)");
      r.setProperty("--gallery-bg", "oklch(0.14 0.006 38)");
    } else {
      // ── Modo claro (premium — terracota) ──
      r.setProperty("--bg", "oklch(0.985 0.003 40)");
      r.setProperty("--bg-card", "oklch(1 0 0)");
      r.setProperty("--bg-section", "oklch(0.97 0.013 32)");
      r.setProperty("--bg-input", "oklch(1 0 0)");
      r.setProperty("--bg-muted", "oklch(0.965 0.004 40)");
      r.setProperty("--text", "oklch(0.26 0.014 38)");
      r.setProperty("--text-muted", "oklch(0.56 0.014 38)");
      r.setProperty("--text-soft", "oklch(0.46 0.014 38)");
      r.setProperty("--border", "oklch(0.92 0.006 38)");
      r.setProperty("--border-soft", "oklch(0.88 0.008 38)");
      r.setProperty("--primary", "oklch(0.52 0.17 28)");
      r.setProperty("--primary-dark", "oklch(0.44 0.16 28)");
      r.setProperty("--primary-light", "oklch(0.95 0.03 30)");
      r.setProperty("--primary-border", "oklch(0.85 0.06 30)");
      r.setProperty("--shadow", "0 1px 3px rgba(60,30,20,0.06), 0 10px 30px -16px rgba(60,30,20,0.15)");
      r.setProperty("--gallery-bg", "oklch(0.14 0.006 38)");
    }
    document.body.style.background = dark ? "oklch(0.19 0.008 38)" : "oklch(0.985 0.003 40)";
    document.body.style.color = dark ? "oklch(0.95 0.005 40)" : "oklch(0.26 0.014 38)";
    document.body.style.transition = "background 0.25s, color 0.25s";
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
        borderRadius: 9, padding: "6px 10px", cursor: "pointer", fontSize: 14,
        color: "var(--text)", ...style
      }}>
      {dark ? "☀️" : "🌙"}
    </button>
  );
}
