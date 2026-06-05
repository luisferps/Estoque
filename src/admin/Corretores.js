import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { addDoc, collection, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { db, auth } from "../firebase";
import { useCorretores } from "../shared/hooks";
import { formatTel } from "../shared/utils";
import { btnPrimary, sectionBox, inputBase, pageWrap } from "../shared/styles";

export default function Corretores() {
  const navigate = useNavigate();
  const { corretores, loading } = useCorretores();
  const [showForm, setShowForm] = useState(false);
  const [novo, setNovo] = useState({ nome: "", email: "", senha: "", telefone: "", creci: "", admin: false });
  const [savingNovo, setSavingNovo] = useState(false);

  const cadastrar = async () => {
    if (!novo.nome || !novo.email || !novo.senha) return alert("Preencha nome, e-mail e senha.");
    if (novo.senha.length < 6) return alert("A senha precisa ter pelo menos 6 caracteres.");
    if (novo.admin && !window.confirm(`Cadastrar "${novo.nome}" como ADMINISTRADOR? Ele terá acesso ao painel admin completo.`)) return;
    setSavingNovo(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, novo.email, novo.senha);
      await addDoc(collection(db, "corretores"), {
        uid: cred.user.uid,
        nome: novo.nome,
        email: novo.email,
        telefone: novo.telefone,
        creci: novo.creci,
        ativo: true,
        admin: !!novo.admin,
        createdAt: Date.now()
      });
      setNovo({ nome: "", email: "", senha: "", telefone: "", creci: "", admin: false });
      setShowForm(false);
      alert(`${novo.admin ? "Administrador" : "Corretor"} "${novo.nome}" cadastrado com sucesso! Pode acessar em /corretores com o e-mail e senha fornecidos.`);
    } catch (e) {
      let msg = e.message;
      if (e.code === "auth/email-already-in-use") msg = "Este e-mail já está cadastrado.";
      if (e.code === "auth/invalid-email") msg = "E-mail inválido.";
      alert("Erro ao cadastrar: " + msg);
    }
    setSavingNovo(false);
  };

  const toggleAtivo = async (c) => {
    await updateDoc(doc(db, "corretores", c.id), { ativo: !c.ativo });
  };

  const toggleAdmin = async (c) => {
    const novo = !c.admin;
    if (novo && !window.confirm(`Promover ${c.nome} a ADMINISTRADOR? Ele terá acesso ao painel admin completo.`)) return;
    if (!novo && !window.confirm(`Remover privilégios de admin de ${c.nome}? Ele continuará como corretor.`)) return;
    await updateDoc(doc(db, "corretores", c.id), { admin: novo });
  };

  const remover = async (c) => {
    if (!window.confirm(`Remover ${c.nome} da lista? (O login no Firebase Auth não é apagado automaticamente; faça isso pelo console se quiser bloquear definitivamente)`)) return;
    await deleteDoc(doc(db, "corretores", c.id));
  };

  return (
    <div style={pageWrap(720)}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1rem" }}>
        <button onClick={() => navigate(-1)} style={backBtn}>← Voltar</button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, flex: 1, color: "var(--primary-dark)" }}>Corretores ({corretores.length})</h2>
        <button onClick={() => setShowForm(s => !s)} style={btnPrimary}>{showForm ? "Cancelar" : "+ Novo corretor"}</button>
      </div>

      {showForm && (
        <div style={sectionBox}>
          <p style={{ margin: "0 0 12px", fontWeight: 500, color: "var(--primary-dark)" }}>Cadastrar novo corretor</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Input label="Nome *" value={novo.nome} onChange={v => setNovo(p => ({ ...p, nome: v }))} />
            <Input label="E-mail *" type="email" value={novo.email} onChange={v => setNovo(p => ({ ...p, email: v.toLowerCase().trim() }))} />
            <Input label="Senha inicial * (mín. 6)" type="password" value={novo.senha} onChange={v => setNovo(p => ({ ...p, senha: v }))} />
            <Input label="CRECI" value={novo.creci} onChange={v => setNovo(p => ({ ...p, creci: v }))} />
            <Input label="Telefone" value={novo.telefone} onChange={v => setNovo(p => ({ ...p, telefone: formatTel(v) }))} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer", marginTop: 10, color: "var(--text)" }}>
            <input type="checkbox" checked={novo.admin} onChange={e => setNovo(p => ({ ...p, admin: e.target.checked }))} style={{ width: 16, height: 16, accentColor: "var(--primary)" }} />
            É administrador? (acesso ao painel admin)
          </label>
          <button onClick={cadastrar} disabled={savingNovo}
            style={{ ...btnPrimary, marginTop: 8, opacity: savingNovo ? 0.6 : 1 }}>
            {savingNovo ? "Cadastrando..." : "Cadastrar"}
          </button>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 0" }}>
            ⚠️ Poderá fazer login imediatamente em <strong>/corretores</strong> com o e-mail e senha definidos.
          </p>
        </div>
      )}

      {loading && <p style={{ color: "var(--text-muted)", textAlign: "center" }}>Carregando...</p>}

      {!loading && corretores.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "3rem 0" }}>
          Nenhum corretor cadastrado ainda.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {corretores.map(c => (
          <div key={c.id} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div>
              <p style={{ margin: 0, fontWeight: 500, color: "var(--text)" }}>
                {c.nome}
                {c.admin && <span style={{ marginLeft: 8, fontSize: 10, padding: "2px 8px", borderRadius: 6, background: "var(--primary)", color: "#fff", fontWeight: 600 }}>ADMIN</span>}
                {!c.ativo && <span style={{ marginLeft: 8, fontSize: 11, color: "#999", fontWeight: 400 }}>(desativado)</span>}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>{c.email}</p>
              {(c.telefone || c.creci) && <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>{[c.creci && `CRECI ${c.creci}`, c.telefone].filter(Boolean).join(" • ")}</p>}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button onClick={() => toggleAdmin(c)} style={{ ...miniBtn, border: c.admin ? "1px solid var(--primary)" : "1px solid var(--border-soft)", background: c.admin ? "var(--primary-light)" : "var(--bg-muted)", color: c.admin ? "var(--primary-dark)" : "var(--text)" }}>
                {c.admin ? "Tirar admin" : "Tornar admin"}
              </button>
              <button onClick={() => toggleAtivo(c)} style={miniBtn}>{c.ativo ? "Desativar" : "Ativar"}</button>
              <button onClick={() => remover(c)} style={{ ...miniBtn, border: "1px solid var(--primary-border)", background: "var(--primary-light)", color: "var(--primary-dark)" }}>Remover</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text" }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 13, color: "var(--text-soft)", marginBottom: 4 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} style={inputBase} />
    </div>
  );
}

const miniBtn = { padding: "6px 12px", fontSize: 12, borderRadius: 7, border: "1px solid var(--border-soft)", background: "var(--bg-muted)", color: "var(--text)", cursor: "pointer" };
const backBtn = { display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", fontSize: 15, cursor: "pointer", color: "var(--primary)", fontWeight: 500, padding: 0 };
