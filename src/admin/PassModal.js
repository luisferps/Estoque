import { useState } from "react";
import { ADMIN_PASS, LOGO_URL } from "../constants";

export default function PassModal({ onClose, onSuccess }) {
  const [pass, setPass] = useState("");
  const [error, setError] = useState(false);

  const submit = () => {
    if (pass === ADMIN_PASS) {
      onSuccess();
      setPass(""); setError(false);
    } else {
      setError(true);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
      <div style={{ background: "var(--bg-card)", borderRadius: 12, padding: "2rem", width: 320, boxShadow: "0 8px 32px rgba(0,0,0,0.2)", color: "var(--text)" }}>
        {LOGO_URL
          ? <img src={LOGO_URL} alt="Logo" style={{ display: "block", maxHeight: 80, maxWidth: "100%", margin: "0 auto 1rem", objectFit: "contain" }} />
          : <div style={{ width: 64, height: 64, background: "var(--primary-light)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem", fontSize: 28 }}>🏠</div>}
        <h3 style={{ margin: "0 0 1rem", textAlign: "center", color: "var(--primary-dark)" }}>Acesso Admin</h3>
        <input
          type="password"
          value={pass}
          onChange={e => { setPass(e.target.value); setError(false); }}
          onKeyDown={e => e.key === "Enter" && submit()}
          placeholder="Senha"
          autoFocus
          style={{
            width: "100%", padding: "10px 12px", borderRadius: 8,
            border: error ? "1px solid var(--primary)" : "1px solid var(--border-soft)",
            fontSize: 15, boxSizing: "border-box", marginBottom: 8,
            background: "var(--bg-input)", color: "var(--text)"
          }}
        />
        {error && <p style={{ color: "var(--primary)", fontSize: 13, margin: "0 0 8px" }}>Senha incorreta.</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer" }}>Cancelar</button>
          <button onClick={submit} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontWeight: 500 }}>Entrar</button>
        </div>
      </div>
    </div>
  );
}
