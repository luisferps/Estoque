import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { addDoc, collection, deleteDoc, doc, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useTipos } from "../shared/hooks";
import { pageWrap, btnPrimary } from "../shared/styles";

const EMOJIS = ["🏠","🏢","📐","🌳","🏭","🏘️","🏡","🏬","🏗️","🌆","🏞️","🏖️","🚜","🏚️","🛖","🏟️","🏨","🏪","🌅","🗺️"];
const COMPORTAMENTOS = [
  { v: "terreno", label: "Terreno (asfalto, água, declive, medidas)" },
  { v: "construcao", label: "Construção (quartos, suítes, garagens)" },
  { v: "simples", label: "Simples (só campos básicos)" },
];
const PADRAO = [
  { nome: "Lote", icone: "📐", comportamento: "terreno", ordem: 0 },
  { nome: "Casa", icone: "🏠", comportamento: "construcao", ordem: 1 },
  { nome: "Apartamento", icone: "🏢", comportamento: "construcao", ordem: 2 },
  { nome: "Área", icone: "🌳", comportamento: "terreno", ordem: 3 },
  { nome: "Galpão", icone: "🏭", comportamento: "simples", ordem: 4 },
];

export default function Tipos() {
  const navigate = useNavigate();
  const { tipos, doBanco } = useTipos();
  const [nome, setNome] = useState("");
  const [icone, setIcone] = useState("🏘️");
  const [comp, setComp] = useState("simples");
  const [busy, setBusy] = useState(false);

  const semearPadrao = async () => {
    if (!window.confirm("Isso vai criar os 5 tipos padrão no banco. Continuar?")) return;
    setBusy(true);
    try {
      for (const t of PADRAO) await addDoc(collection(db, "tipos"), t);
    } catch (e) { alert("Erro: " + e.message); }
    setBusy(false);
  };

  const adicionar = async () => {
    const n = nome.trim();
    if (!n) return alert("Digite o nome do tipo.");
    if (tipos.some(t => t.nome.toLowerCase() === n.toLowerCase())) return alert("Esse tipo já existe.");
    setBusy(true);
    try {
      // Se ainda não está no banco, semeia os padrão primeiro
      if (!doBanco) for (const t of PADRAO) await addDoc(collection(db, "tipos"), t);
      const ordem = (tipos.reduce((m, t) => Math.max(m, t.ordem || 0), 0)) + 1;
      await addDoc(collection(db, "tipos"), { nome: n, icone, comportamento: comp, ordem });
      setNome(""); setIcone("🏘️"); setComp("simples");
    } catch (e) { alert("Erro: " + e.message); }
    setBusy(false);
  };

  const remover = async (t) => {
    if (!t.id) return alert("Use 'Criar tipos padrão' primeiro pra poder editar.");
    // checa se tem imóvel usando esse tipo
    setBusy(true);
    try {
      const snap = await getDocs(query(collection(db, "imoveis"), where("tipo", "==", t.nome)));
      if (snap.size > 0) {
        if (!window.confirm(`Existem ${snap.size} imóveis do tipo "${t.nome}". Se remover o tipo, esses imóveis continuam existindo mas ficam sem categoria. Remover mesmo assim?`)) {
          setBusy(false); return;
        }
      } else {
        if (!window.confirm(`Remover o tipo "${t.nome}"?`)) { setBusy(false); return; }
      }
      await deleteDoc(doc(db, "tipos", t.id));
    } catch (e) { alert("Erro: " + e.message); }
    setBusy(false);
  };

  return (
    <div style={pageWrap(680)}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1rem" }}>
        <button onClick={() => navigate("/admin")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", fontSize: 15, cursor: "pointer", color: "var(--primary)", fontWeight: 500, padding: 0 }}>← Voltar</button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, flex: 1, color: "var(--primary-dark)" }}>Tipos de imóvel</h2>
      </div>

      {!doBanco && (
        <div style={{ background: "var(--bg-section)", border: "1px solid var(--primary-border)", borderRadius: 10, padding: "1rem", marginBottom: "1rem", fontSize: 13, color: "var(--text-soft)" }}>
          ℹ️ Os tipos ainda são os padrão do sistema. Ao adicionar o primeiro tipo, eles serão salvos no banco automaticamente e poderão ser editados/removidos.
        </div>
      )}

      <div style={{ background: "var(--bg-muted)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: "1rem", marginBottom: "1.5rem" }}>
        <p style={{ margin: "0 0 12px", fontWeight: 500, fontSize: 14, color: "var(--text)" }}>➕ Adicionar tipo</p>
        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>Nome do tipo</label>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Chácara, Sala comercial..." style={inp} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>Ícone</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {EMOJIS.map(e => (
              <button key={e} onClick={() => setIcone(e)} style={{ fontSize: 22, padding: "4px 8px", borderRadius: 8, cursor: "pointer", border: icone === e ? "2px solid var(--primary)" : "1px solid var(--border-soft)", background: icone === e ? "var(--primary-light)" : "var(--bg-input)" }}>{e}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Comportamento (quais campos aparecem no cadastro)</label>
          <select value={comp} onChange={e => setComp(e.target.value)} style={inp}>
            {COMPORTAMENTOS.map(c => <option key={c.v} value={c.v}>{c.label}</option>)}
          </select>
        </div>
        <button onClick={adicionar} disabled={busy} style={{ ...btnPrimary, width: "100%", padding: "11px 0", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Aguarde..." : `Adicionar "${nome || "novo tipo"}"`}
        </button>
      </div>

      <p style={{ fontWeight: 500, fontSize: 14, color: "var(--text)", marginBottom: 10 }}>Tipos atuais ({tipos.length})</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tipos.map((t, i) => (
          <div key={t.id || i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <span style={{ fontSize: 26 }}>{t.icone || "🏘️"}</span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 500, color: "var(--text)" }}>{t.nome}</p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
                {t.comportamento === "terreno" ? "Terreno" : t.comportamento === "construcao" ? "Construção" : "Simples"}
              </p>
            </div>
            <button onClick={() => remover(t)} disabled={busy} style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid var(--primary-border)", background: "var(--primary-light)", color: "var(--primary-dark)", cursor: "pointer", fontSize: 13 }}>Remover</button>
          </div>
        ))}
      </div>

      {!doBanco && (
        <button onClick={semearPadrao} disabled={busy} style={{ marginTop: 16, padding: "9px 16px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-muted)", color: "var(--text-soft)", cursor: "pointer", fontSize: 13 }}>
          Criar os 5 tipos padrão no banco (pra poder editar)
        </button>
      )}
    </div>
  );
}

const lbl = { display: "block", fontSize: 13, color: "var(--text-soft)", marginBottom: 4 };
const inp = { width: "100%", padding: "10px 12px", borderRadius: 8, boxSizing: "border-box", border: "1px solid var(--border-soft)", fontSize: 14, background: "var(--bg-input)", color: "var(--text)" };
