import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebase";
import { LOGO_URL, EMPRESA } from "../constants";
import { inputBase } from "../shared/styles";
import { DarkModeToggle } from "../shared/ThemeProvider";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetMsg, setResetMsg] = useState("");

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.toLowerCase().trim(), senha);
      navigate("/corretores/painel");
    } catch (e) {
      let msg = "Erro ao fazer login.";
      if (e.code === "auth/invalid-credential" || e.code === "auth/wrong-password" || e.code === "auth/user-not-found") {
        msg = "E-mail ou senha incorretos.";
      } else if (e.code === "auth/too-many-requests") {
        msg = "Muitas tentativas. Aguarde alguns minutos.";
      } else if (e.code === "auth/invalid-email") {
        msg = "E-mail inválido.";
      }
      setError(msg);
    }
    setLoading(false);
  };

  const resetSenha = async () => {
    if (!email) { setResetMsg("Digite seu e-mail no campo acima."); return; }
    try {
      await sendPasswordResetEmail(auth, email.toLowerCase().trim());
      setResetMsg("Enviamos um e-mail com o link para redefinir sua senha.");
    } catch (e) {
      setResetMsg("Não foi possível enviar o e-mail. Verifique se o endereço está correto.");
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)", color: "var(--text)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "2rem 1rem", position: "relative"
    }}>
      <div style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 8 }}>
        <DarkModeToggle />
        <button onClick={() => navigate("/")} style={{
          padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border-soft)",
          background: "var(--bg-muted)", color: "var(--text-soft)", cursor: "pointer", fontSize: 13
        }}>← Site</button>
      </div>

      <div style={{
        background: "var(--bg-card)", borderRadius: 16, padding: "2.5rem 2rem",
        width: "100%", maxWidth: 380, boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        border: "1px solid var(--border)"
      }}>
        {LOGO_URL && <img src={LOGO_URL} alt="Logo" style={{ display: "block", maxHeight: 70, margin: "0 auto 1rem", objectFit: "contain" }} />}
        <h2 style={{ margin: "0 0 4px", textAlign: "center", color: "var(--primary-dark)", fontSize: 20 }}>Área do Corretor</h2>
        <p style={{ margin: "0 0 1.5rem", textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>{EMPRESA.nome}</p>

        <label style={labelStyle}>E-mail</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          style={{ ...inputBase, marginBottom: 12 }}
          autoFocus
        />

        <label style={labelStyle}>Senha</label>
        <input
          type="password"
          value={senha}
          onChange={e => setSenha(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          style={{ ...inputBase, marginBottom: 8 }}
        />

        {error && <p style={{ color: "var(--primary)", fontSize: 13, margin: "0 0 8px" }}>{error}</p>}

        <button onClick={submit} disabled={loading}
          style={{
            width: "100%", padding: "12px 0", borderRadius: 8, border: "none",
            background: loading ? "#aaa" : "var(--primary)", color: "#fff",
            cursor: loading ? "default" : "pointer", fontWeight: 600, fontSize: 15,
            marginTop: 8, marginBottom: 12
          }}>
          {loading ? "Entrando..." : "Entrar"}
        </button>

        <div style={{ textAlign: "center" }}>
          {!showReset
            ? <button onClick={() => setShowReset(true)} style={linkStyle}>Esqueci minha senha</button>
            : <>
                <button onClick={resetSenha} style={linkStyle}>Enviar link de redefinição para "{email || "seu e-mail"}"</button>
                {resetMsg && <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 0" }}>{resetMsg}</p>}
              </>}
        </div>

        <p style={{ marginTop: 24, fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
          Não tem acesso? Entre em contato com a administração.
        </p>
      </div>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 13, color: "var(--text-soft)", marginBottom: 4 };
const linkStyle = {
  background: "none", border: "none", color: "var(--primary)",
  cursor: "pointer", fontSize: 13, textDecoration: "underline", padding: 0
};
