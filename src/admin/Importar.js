import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { criarImovelBackend, excluirImovelBackend } from "../shared/estoqueApi";
import { db } from "../firebase";
import { useTipos } from "../shared/hooks";
import { btnPrimary } from "../shared/styles";
import { LOGO_URL } from "../constants";

export default function Importar() {
  const navigate = useNavigate();
  const { tipos } = useTipos();
  const [texto, setTexto] = useState("");
  const [importando, setImportando] = useState(false);
  const [log, setLog] = useState([]);
  const [feito, setFeito] = useState(false);
  const [tipoLimpar, setTipoLimpar] = useState("Lote");

  const addLog = (msg) => setLog(l => [...l, msg]);

  const limparTipo = async () => {
    if (!window.confirm(`Tem certeza que deseja APAGAR todos os imóveis do tipo "${tipoLimpar}"? Esta ação não pode ser desfeita.`)) return;
    setImportando(true);
    setLog([]);
    setFeito(false);
    try {
      const q = query(collection(db, "imoveis"), where("tipo", "==", tipoLimpar));
      const snap = await getDocs(q);
      addLog(`Encontrados ${snap.size} imóveis do tipo "${tipoLimpar}".`);
      let n = 0;
      for (const d of snap.docs) {
        await excluirImovelBackend(d.id);
        n++;
        addLog(`🗑️ ${n}/${snap.size} apagado`);
      }
      addLog(`\n✅ ${n} imóveis do tipo "${tipoLimpar}" foram apagados.`);
    } catch (e) {
      addLog(`❌ ERRO: ${e.message}`);
    }
    setImportando(false);
    setFeito(true);
  };

  const importar = async () => {
    let dados;
    try {
      dados = JSON.parse(texto);
    } catch (e) {
      alert("O texto colado não é um JSON válido. Verifique se copiou tudo corretamente.");
      return;
    }
    if (!Array.isArray(dados)) {
      alert("O JSON precisa ser uma lista de imóveis (começar com [ ).");
      return;
    }
    if (!window.confirm(`Você está prestes a cadastrar ${dados.length} imóveis. Continuar?`)) return;

    setImportando(true);
    setLog([]);
    setFeito(false);
    let ok = 0, erros = 0;

    for (let i = 0; i < dados.length; i++) {
      const im = dados[i];
      try {
        await criarImovelBackend({ ...im });
        ok++;
        addLog(`✅ ${i + 1}/${dados.length} — ${im.titulo || "sem título"} (${im.cidade || ""})`);
      } catch (e) {
        erros++;
        addLog(`❌ ${i + 1}/${dados.length} — ERRO: ${e.message}`);
      }
    }

    addLog(`\n🎉 Concluído! ${ok} cadastrados, ${erros} com erro.`);
    setImportando(false);
    setFeito(true);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <style>{`
        .ip-nav { position: sticky; top: 0; z-index: 100; background: rgba(255,255,255,0.85); backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px); border-bottom: 1px solid var(--border); }
        .ip-nav-inner { max-width: 720px; margin: 0 auto; height: 54px; padding: 0 20px; display: flex; align-items: center; gap: 14px; }
      `}</style>
      <nav className="ip-nav">
        <div className="ip-nav-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => navigate("/admin")}>
            <img src={LOGO_URL} alt="Inerente" style={{ height: 24 }} />
            <b style={{ fontSize: 16, fontWeight: 600, color: "var(--primary-dark)" }}>Inerente</b>
          </div>
        </div>
      </nav>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "22px 20px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "1.25rem" }}>
        <button onClick={() => navigate("/admin")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", fontSize: 14, cursor: "pointer", color: "var(--primary)", fontWeight: 500, padding: 0 }}>← Voltar</button>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", flex: 1, color: "var(--text)" }}>Importar imóveis em massa</h2>
      </div>

      <div style={{ background: "#fff8e1", border: "1px solid #f0d98c", borderRadius: 12, padding: "13px 16px", marginBottom: "1rem", fontSize: 13, color: "#8a6d3b", lineHeight: 1.5 }}>
        ⚠️ <strong>Atenção:</strong> Cole o JSON gerado da planilha e clique em Importar. Os imóveis entram como "Disponível" e sem fotos.
      </div>

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, padding: "18px 20px", marginBottom: "1rem" }}>
        <p style={{ margin: "0 0 8px", fontWeight: 500, fontSize: 14, color: "var(--text)" }}>🗑️ Limpar antes de importar (opcional)</p>
        <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--text-muted)" }}>Apaga todos os imóveis de um tipo específico. Útil pra re-importar sem duplicar. NÃO afeta os outros tipos.</p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={tipoLimpar} onChange={e => setTipoLimpar(e.target.value)} disabled={importando}
            style={{ padding: "9px 13px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 14, background: "var(--bg-input)", color: "var(--text)", outline: "none", fontFamily: "inherit", cursor: "pointer" }}>
            {tipos.map(t => <option key={t.nome}>{t.nome}</option>)}
          </select>
          <button onClick={limparTipo} disabled={importando}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--primary)", background: "var(--primary-light)", color: "var(--primary-dark)", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
            Apagar todos os "{tipoLimpar}"
          </button>
        </div>
      </div>

      <textarea
        value={texto}
        onChange={e => setTexto(e.target.value)}
        placeholder="Cole aqui o JSON dos imóveis..."
        rows={10}
        disabled={importando}
        style={{ width: "100%", padding: "13px", borderRadius: 12, boxSizing: "border-box", border: "1px solid var(--border)", fontSize: 13, fontFamily: "ui-monospace, monospace", background: "var(--bg-input)", color: "var(--text)", resize: "vertical", lineHeight: 1.4, outline: "none" }}
      />

      <button onClick={importar} disabled={importando || !texto.trim()}
        style={{ ...btnPrimary, width: "100%", padding: "13px 0", marginTop: 12, fontSize: 15, opacity: (importando || !texto.trim()) ? 0.6 : 1 }}>
        {importando ? "Processando... aguarde" : "Importar imóveis"}
      </button>

      {log.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <p style={{ fontWeight: 500, color: "var(--text)", marginBottom: 8 }}>Resultado:</p>
          <div style={{ background: "var(--bg-muted)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px", maxHeight: 360, overflowY: "auto", fontSize: 12, fontFamily: "monospace", color: "var(--text-soft)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
            {log.join("\n")}
          </div>
        </div>
      )}

      {feito && (
        <button onClick={() => navigate("/admin")} style={{ ...btnPrimary, width: "100%", padding: "13px 0", marginTop: 12 }}>
          Ver imóveis cadastrados
        </button>
      )}
      </div>
    </div>
  );
}
