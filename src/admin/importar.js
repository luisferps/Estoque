import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { addDoc, collection } from "firebase/firestore";
import { db } from "../firebase";
import { pageWrap, btnPrimary } from "../shared/styles";

export default function Importar() {
  const navigate = useNavigate();
  const [texto, setTexto] = useState("");
  const [importando, setImportando] = useState(false);
  const [log, setLog] = useState([]);
  const [feito, setFeito] = useState(false);

  const addLog = (msg) => setLog(l => [...l, msg]);

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
        await addDoc(collection(db, "imoveis"), {
          ...im,
          createdAt: Date.now() + i,
        });
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
    <div style={pageWrap(720)}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1rem" }}>
        <button onClick={() => navigate("/admin")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", fontSize: 15, cursor: "pointer", color: "var(--primary)", fontWeight: 500, padding: 0 }}>← Voltar</button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, flex: 1, color: "var(--primary-dark)" }}>Importar imóveis em massa</h2>
      </div>

      <div style={{ background: "var(--bg-section)", border: "1px solid var(--primary-border)", borderRadius: 10, padding: "1rem", marginBottom: "1rem", fontSize: 13, color: "var(--text-soft)" }}>
        ⚠️ <strong>Atenção:</strong> Esta ferramenta cadastra vários imóveis de uma vez. Cole abaixo o JSON gerado a partir da planilha e clique em Importar. Os imóveis entram como "Disponível" e sem fotos (você adiciona depois).
      </div>

      <textarea
        value={texto}
        onChange={e => setTexto(e.target.value)}
        placeholder="Cole aqui o JSON dos imóveis..."
        rows={10}
        disabled={importando}
        style={{
          width: "100%", padding: "12px", borderRadius: 8, boxSizing: "border-box",
          border: "1px solid var(--border-soft)", fontSize: 12, fontFamily: "monospace",
          background: "var(--bg-input)", color: "var(--text)", resize: "vertical", lineHeight: 1.4
        }}
      />

      <button onClick={importar} disabled={importando || !texto.trim()}
        style={{ ...btnPrimary, width: "100%", padding: "13px 0", marginTop: 12, fontSize: 15, opacity: (importando || !texto.trim()) ? 0.6 : 1 }}>
        {importando ? "Importando... aguarde" : "Importar imóveis"}
      </button>

      {log.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <p style={{ fontWeight: 500, color: "var(--text)", marginBottom: 8 }}>Resultado:</p>
          <div style={{
            background: "var(--bg-muted)", border: "1px solid var(--border)", borderRadius: 8,
            padding: "12px", maxHeight: 360, overflowY: "auto", fontSize: 12, fontFamily: "monospace",
            color: "var(--text-soft)", whiteSpace: "pre-wrap", lineHeight: 1.6
          }}>
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
  );
}
