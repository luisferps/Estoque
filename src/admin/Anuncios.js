import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { CANAIS, TRANSACOES } from "../constants";
import { useImoveis, useTipos } from "../shared/hooks";
import { formatBRL, matchTransacao, statusDoImovel, validarParaCanal, CANAIS_AUTO } from "../shared/utils";
import { pageWrap } from "../shared/styles";

export default function Anuncios() {
  const navigate = useNavigate();
  const { imoveis } = useImoveis();
  const { tipos } = useTipos();
  const [fTipo, setFTipo] = useState("Todos");
  const [fTransacao, setFTransacao] = useState("Todos");
  const [fCidade, setFCidade] = useState("Todas");
  const [fCanal, setFCanal] = useState("Todos");
  const [soPendencias, setSoPendencias] = useState(false);

  const cidades = useMemo(() => ["Todas", ...Array.from(new Set(imoveis.map(im => im.cidade).filter(Boolean))).sort()], [imoveis]);

  const filtered = useMemo(() => imoveis.filter(im => {
    let matchCanal = true;
    if (fCanal === "Todos") matchCanal = true;
    else if (fCanal === "Anunciado") matchCanal = CANAIS.some(c => im.anuncios?.[c]?.ativo);
    else if (fCanal === "Não anunciado") matchCanal = !CANAIS.some(c => im.anuncios?.[c]?.ativo);
    else if (fCanal.startsWith("nao_")) matchCanal = !im.anuncios?.[fCanal.replace("nao_", "")]?.ativo;
    else if (fCanal.startsWith("sim_")) matchCanal = !!im.anuncios?.[fCanal.replace("sim_", "")]?.ativo;

    // Filtro de "só com pendências": imóvel tem flag ativa de canal automático com problemas?
    let matchPendencia = true;
    if (soPendencias) {
      matchPendencia = CANAIS_AUTO.some(c =>
        im.anuncios?.[c]?.ativo && validarParaCanal(im, c).length > 0
      );
    }

    return (fTipo === "Todos" || im.tipo === fTipo)
      && matchTransacao(im, fTransacao)
      && (fCidade === "Todas" || im.cidade === fCidade)
      && matchCanal
      && matchPendencia;
  }), [imoveis, fTipo, fTransacao, fCidade, fCanal, soPendencias]);

  const toggle = async (im, canal) => {
    const atual = im.anuncios?.[canal];
    const novo = { ...(im.anuncios || {}), [canal]: atual ? null : { ativo: true, data: new Date().toLocaleDateString("pt-BR") } };
    try { await updateDoc(doc(db, "imoveis", im.id), { anuncios: novo }); }
    catch (e) { alert("Erro: " + e.message); }
  };

  return (
    <div style={pageWrap(1300)}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1rem" }}>
        <button onClick={() => navigate(-1)} style={backBtn}>← Voltar</button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, flex: 1, color: "var(--primary-dark)" }}>Controle de Anúncios</h2>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <select value={fTipo} onChange={e => setFTipo(e.target.value)} style={selectStyle}>
          <option value="Todos">Todos os tipos</option>{tipos.map(t => <option key={t.nome}>{t.nome}</option>)}
        </select>
        <select value={fTransacao} onChange={e => setFTransacao(e.target.value)} style={selectStyle}>
          <option value="Todos">Todas as transações</option>{TRANSACOES.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={fCidade} onChange={e => setFCidade(e.target.value)} style={selectStyle}>
          {cidades.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={fCanal} onChange={e => setFCanal(e.target.value)} style={selectStyle}>
          <option value="Todos">Todos os canais</option>
          <option value="Anunciado">Com anúncio ativo</option>
          <option value="Não anunciado">Sem anúncio em nenhum canal</option>
          <optgroup label="— Não anunciado em:">
            {CANAIS.map(c => <option key={`nao_${c}`} value={`nao_${c}`}>Falta: {c}</option>)}
          </optgroup>
          <optgroup label="— Anunciado em:">
            {CANAIS.map(c => <option key={`sim_${c}`} value={`sim_${c}`}>Ativo: {c}</option>)}
          </optgroup>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-soft)", background: soPendencias ? "var(--primary-light)" : "var(--bg-input)", color: soPendencias ? "var(--primary-dark)" : "var(--text)" }}>
          <input type="checkbox" checked={soPendencias} onChange={e => setSoPendencias(e.target.checked)} style={{ width: 14, height: 14, accentColor: "var(--primary)" }} />
          ⚠️ Só com pendências
        </label>
        <span style={{ fontSize: 13, color: "var(--text-muted)", alignSelf: "center" }}>{filtered.length} imóvel(is)</span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, color: "var(--text)" }}>
          <thead>
            <tr style={{ background: "var(--primary)", color: "#fff" }}>
              <th style={th}>Tipo</th>
              <th style={th}>Status</th>
              <th style={th}>Cidade</th>
              <th style={th}>Bairro</th>
              <th style={th}>Preço</th>
              <th style={{ ...th, whiteSpace: "nowrap" }}>Proprietário</th>
              {CANAIS.map(c => (
                <th key={c} style={{ padding: "8px 6px", textAlign: "center", fontSize: 10, whiteSpace: "nowrap" }}>
                  {CANAIS_AUTO.includes(c) && <span title="Integração automática via feed XML">⚙ </span>}
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6 + CANAIS.length} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>Nenhum imóvel encontrado.</td></tr>
            )}
            {filtered.map((im, idx) => {
              const preco = im.transacao === "Locação" ? (im.valorFinal ? formatBRL(im.valorFinal) + "/mês" : "") : formatBRL(im.preco);
              return (
                <tr key={im.id} style={{ background: idx % 2 === 0 ? "var(--bg-card)" : "var(--bg-section)" }}>
                  <td style={td}>
                    <span style={tag("primary")}>{im.tipo}</span>
                    {im.transacao && <span style={{ ...tag(), marginLeft: 4 }}>{im.transacao}</span>}
                  </td>
                  <td style={td}>{statusDoImovel(im)}</td>
                  <td style={td}>{im.cidade || "—"}</td>
                  <td style={td}>{im.bairro || "—"}</td>
                  <td style={{ ...td, color: "var(--primary)", fontWeight: 500, whiteSpace: "nowrap" }}>{preco || "—"}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{im.nomeProprietario || "—"}</td>
                  {CANAIS.map(canal => {
                    const info = im.anuncios?.[canal];
                    const ativo = !!info?.ativo;
                    const isAuto = CANAIS_AUTO.includes(canal);
                    const problemas = ativo && isAuto ? validarParaCanal(im, canal) : [];
                    const temProblema = problemas.length > 0;

                    // Visual:
                    // - Não ativo → checkbox cinza
                    // - Ativo + OK → check verde
                    // - Ativo + com problema → ⚠️ amarelo (com tooltip)
                    const corBorda = !ativo ? "var(--border-soft)"
                      : temProblema ? "#d97706"
                      : "var(--primary)";
                    const corFundo = !ativo ? "var(--bg-muted)"
                      : temProblema ? "#fef3c7"
                      : "var(--primary-light)";
                    const icone = !ativo ? "⬜"
                      : temProblema ? "⚠️"
                      : "✅";

                    // Tooltip nativo do navegador
                    const tooltipTitle = temProblema
                      ? `Não será publicado em ${canal}:\n• ${problemas.join("\n• ")}`
                      : "";

                    return (
                      <td key={canal} style={{ padding: 5, textAlign: "center" }}>
                        <button onClick={() => toggle(im, canal)} title={tooltipTitle}
                          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: corFundo, border: `1px solid ${corBorda}`, borderRadius: 8, padding: "4px 6px", cursor: "pointer", width: "100%", minWidth: 56, color: "var(--text)" }}>
                          <span style={{ fontSize: 14 }}>{icone}</span>
                          {ativo && <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{info.data}</span>}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legenda */}
      <div style={{ marginTop: 14, padding: "10px 14px", background: "var(--bg-section)", borderRadius: 8, fontSize: 12, color: "var(--text-muted)" }}>
        <strong style={{ color: "var(--text)" }}>Legenda:</strong>{" "}
        <span style={{ marginRight: 14 }}>⬜ Não anunciado</span>
        <span style={{ marginRight: 14 }}>✅ Anunciado</span>
        <span style={{ marginRight: 14, color: "#d97706" }}>⚠️ Anunciado mas com pendências (passe o mouse para ver)</span>
        <span>⚙ Canal com integração automática via feed XML</span>
      </div>
    </div>
  );
}

const th = { padding: "8px 10px", textAlign: "left" };
const td = { padding: "8px 10px" };
const selectStyle = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-soft)", fontSize: 13, background: "var(--bg-input)", color: "var(--text)" };
const tag = (variant) => ({
  fontSize: 11,
  background: variant === "primary" ? "var(--primary-light)" : "var(--bg-muted)",
  color: variant === "primary" ? "var(--primary-dark)" : "var(--text-soft)",
  borderRadius: 6, padding: "2px 8px"
});
const backBtn = { display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", fontSize: 15, cursor: "pointer", color: "var(--primary)", fontWeight: 500, padding: 0 };
