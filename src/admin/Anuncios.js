import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { editarImovelBackend } from "../shared/estoqueApi";
import { CANAIS, TRANSACOES } from "../constants";
import { useImoveis, useTipos } from "../shared/hooks";
import { formatBRL, matchTransacao, statusDoImovel, validarParaCanal, CANAIS_AUTO, geocodificarEndereco } from "../shared/utils";
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
  const [sortCol, setSortCol] = useState("");
  const [sortDir, setSortDir] = useState("asc");

  const [migrando, setMigrando] = useState(false);
  const [migracaoTotal, setMigracaoTotal] = useState(0);
  const [migracaoAtual, setMigracaoAtual] = useState(0);
  const [migracaoNome, setMigracaoNome] = useState("");
  const [migracaoLog, setMigracaoLog] = useState({ uf: 0, coords: 0, erros: 0 });

  const cidades = useMemo(() => ["Todas", ...Array.from(new Set(imoveis.map(im => im.cidade).filter(Boolean))).sort()], [imoveis]);

  const incompletos = useMemo(() =>
    imoveis.filter(im => !im.estado || !im.latitude || !im.longitude),
    [imoveis]
  );

  const filtered = useMemo(() => imoveis.filter(im => {
    let matchCanal = true;
    if (fCanal === "Todos") matchCanal = true;
    else if (fCanal === "Anunciado") matchCanal = CANAIS.some(c => im.anuncios?.[c]?.ativo);
    else if (fCanal === "Não anunciado") matchCanal = !CANAIS.some(c => im.anuncios?.[c]?.ativo);
    else if (fCanal.startsWith("nao_")) matchCanal = !im.anuncios?.[fCanal.replace("nao_", "")]?.ativo;
    else if (fCanal.startsWith("sim_")) matchCanal = !!im.anuncios?.[fCanal.replace("sim_", "")]?.ativo;

    // "Só os que não sobem": imóvel que está FORA de algum feed automático por
    // requisito faltando — independe da marcação manual (o que vale é o feed real).
    let matchPendencia = true;
    if (soPendencias) {
      matchPendencia = CANAIS_AUTO.some(c => validarParaCanal(im, c).length > 0);
    }

    return (fTipo === "Todos" || im.tipo === fTipo)
      && matchTransacao(im, fTransacao)
      && (fCidade === "Todas" || im.cidade === fCidade)
      && matchCanal
      && matchPendencia;
  }), [imoveis, fTipo, fTransacao, fCidade, fCanal, soPendencias]);

  // Ordenação tipo Excel: clica no cabeçalho → ordena por aquela coluna (alterna A→Z / Z→A).
  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = valorOrdenacao(a, sortCol);
      const vb = valorOrdenacao(b, sortCol);
      let cmp;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), "pt-BR", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortCol, sortDir]);

  const ordenarPor = (col) => {
    if (sortCol === col) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  const setaDe = (col) => {
    if (sortCol !== col) return <span style={{ opacity: 0.35, fontSize: 9 }}> ↕</span>;
    return <span style={{ fontSize: 10 }}>{sortDir === "asc" ? " ▲" : " ▼"}</span>;
  };

  const toggle = async (im, canal) => {
    const atual = im.anuncios?.[canal];
    const novo = { ...(im.anuncios || {}), [canal]: atual ? null : { ativo: true, data: new Date().toLocaleDateString("pt-BR") } };
    try { await editarImovelBackend(im.id, { anuncios: novo }); }
    catch (e) { alert("Erro: " + e.message); }
  };

  const iniciarMigracao = async () => {
    const confirma = window.confirm(
      `Vou processar ${incompletos.length} imóveis:\n\n` +
      `• Imóveis sem UF serão marcados como "GO"\n` +
      `• Coordenadas serão buscadas automaticamente no OpenStreetMap\n\n` +
      `O processo leva ~1 segundo por imóvel. Continuar?`
    );
    if (!confirma) return;

    setMigrando(true);
    setMigracaoTotal(incompletos.length);
    setMigracaoAtual(0);
    setMigracaoLog({ uf: 0, coords: 0, erros: 0 });

    const log = { uf: 0, coords: 0, erros: 0 };

    for (let i = 0; i < incompletos.length; i++) {
      const im = incompletos[i];
      setMigracaoAtual(i + 1);
      setMigracaoNome(im.titulo || im.bairro || im.id);

      const updates = {};
      let estadoFinal = im.estado;
      if (!estadoFinal) {
        updates.estado = "GO";
        estadoFinal = "GO";
        log.uf++;
      }

      if ((!im.latitude || !im.longitude) && im.cidade) {
        try {
          const coords = await geocodificarEndereco({
            endereco: im.endereco,
            bairro: im.bairro,
            cidade: im.cidade,
            estado: estadoFinal,
            cep: im.cep,
          });
          if (coords) {
            updates.latitude = coords.latitude;
            updates.longitude = coords.longitude;
            log.coords++;
          }
        } catch {
          log.erros++;
        }
      }

      if (Object.keys(updates).length > 0) {
        try {
          await editarImovelBackend(im.id, updates);
        } catch {
          log.erros++;
        }
      }

      setMigracaoLog({ ...log });
      await new Promise(r => setTimeout(r, 1100));
    }

    setMigrando(false);
    setMigracaoNome("");
    alert(
      `Migração concluída!\n\n` +
      `• ${log.uf} imóveis receberam UF "GO"\n` +
      `• ${log.coords} imóveis receberam coordenadas\n` +
      `• ${log.erros} erros\n\n` +
      `Imóveis que não receberam coordenadas provavelmente têm cidade vazia ou endereço não encontrado pelo OpenStreetMap.`
    );
  };

  return (
    <div style={pageWrap(1300)}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1rem" }}>
        <button onClick={() => navigate(-1)} style={backBtn}>← Voltar</button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, flex: 1, color: "var(--primary-dark)" }}>Controle de Anúncios</h2>
      </div>

      {incompletos.length > 0 && !migrando && (
        <div style={{ marginBottom: "1rem", padding: "12px 16px", background: "#fef3c7", border: "1px solid #d97706", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 13, color: "#78350f" }}>
            <strong>⚠️ {incompletos.length} imóveis estão sem UF ou sem coordenadas.</strong>{" "}
            Isso impede que apareçam corretamente nos feeds dos portais.
          </div>
          <button onClick={iniciarMigracao}
            style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#d97706", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>
            🚀 Atualizar todos automaticamente
          </button>
        </div>
      )}

      {migrando && (
        <div style={{ marginBottom: "1rem", padding: "16px 20px", background: "var(--primary-light)", border: "1px solid var(--primary)", borderRadius: 8 }}>
          <div style={{ marginBottom: 10 }}>
            <strong style={{ color: "var(--primary-dark)" }}>🔄 Atualizando imóveis...</strong>
          </div>
          <div style={{ marginBottom: 8, fontSize: 12, color: "var(--text-soft)" }}>
            {migracaoAtual} de {migracaoTotal} — {migracaoNome}
          </div>
          <div style={{ height: 8, background: "var(--bg-muted)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(migracaoAtual / migracaoTotal) * 100}%`, background: "var(--primary)", transition: "width 0.3s" }} />
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>
            UF preenchidas: {migracaoLog.uf} • Coordenadas encontradas: {migracaoLog.coords} • Erros: {migracaoLog.erros}
          </div>
        </div>
      )}

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
          ❌ Só os que não sobem
        </label>
        <span style={{ fontSize: 13, color: "var(--text-muted)", alignSelf: "center" }}>{filtered.length} imóvel(is)</span>
      </div>

      {/* Container com altura limitada: a barra de rolagem horizontal fica sempre
          visível na base (sem precisar descer até o fim da tabela) e o cabeçalho
          fica fixo no topo ao rolar verticalmente. */}
      <div style={{ overflow: "auto", maxHeight: "calc(100vh - 230px)", border: "1px solid var(--border-soft)", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, color: "var(--text)" }}>
          <thead>
            <tr>
              <th style={{ ...th, cursor: "pointer", userSelect: "none" }} onClick={() => ordenarPor("tipo")} title="Clique para ordenar">Tipo{setaDe("tipo")}</th>
              <th style={{ ...th, cursor: "pointer", userSelect: "none" }} onClick={() => ordenarPor("status")} title="Clique para ordenar">Status{setaDe("status")}</th>
              <th style={{ ...th, cursor: "pointer", userSelect: "none" }} onClick={() => ordenarPor("cidade")} title="Clique para ordenar">Cidade{setaDe("cidade")}</th>
              <th style={{ ...th, cursor: "pointer", userSelect: "none" }} onClick={() => ordenarPor("bairro")} title="Clique para ordenar">Bairro{setaDe("bairro")}</th>
              <th style={{ ...th, cursor: "pointer", userSelect: "none" }} onClick={() => ordenarPor("preco")} title="Clique para ordenar">Preço{setaDe("preco")}</th>
              <th style={{ ...th, whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }} onClick={() => ordenarPor("proprietario")} title="Clique para ordenar">Proprietário{setaDe("proprietario")}</th>
              {CANAIS.map(c => (
                <th key={c} style={{ ...thCanal, cursor: "pointer", userSelect: "none" }} onClick={() => ordenarPor(c)} title="Clique para ordenar por status no feed">
                  {CANAIS_AUTO.includes(c) && <span title="Integração automática via feed XML">⚙ </span>}
                  {c}{setaDe(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={6 + CANAIS.length} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>Nenhum imóvel encontrado.</td></tr>
            )}
            {sorted.map((im, idx) => {
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
                    const isAuto = CANAIS_AUTO.includes(canal);

                    // CANAIS AUTOMÁTICOS (feed XML): mostram o status REAL do feed,
                    // não a marcação manual. ✅ no feed (sem pendências) / ❌ fora (com o motivo).
                    if (isAuto) {
                      const problemas = validarParaCanal(im, canal);
                      const noFeed = problemas.length === 0;
                      const corBorda = noFeed ? "var(--primary)" : "#dc2626";
                      const corFundo = noFeed ? "var(--primary-light)" : "#fee2e2";
                      const icone = noFeed ? "✅" : "❌";
                      const motivos = `${canal} — fora do feed:\n\n• ${problemas.join("\n• ")}`;
                      const tooltipTitle = noFeed ? `${canal} — no feed` : `${canal} — fora do feed:\n• ${problemas.join("\n• ")}`;
                      return (
                        <td key={canal} style={{ padding: 5, textAlign: "center" }}>
                          <button
                            onClick={() => { if (!noFeed) alert(motivos); }}
                            title={tooltipTitle}
                            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: corFundo, border: `1px solid ${corBorda}`, borderRadius: 8, padding: "4px 6px", cursor: noFeed ? "default" : "pointer", width: "100%", minWidth: 56, color: "var(--text)" }}>
                            <span style={{ fontSize: 14 }}>{icone}</span>
                            <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{noFeed ? "no feed" : "fora"}</span>
                          </button>
                        </td>
                      );
                    }

                    // CANAIS MANUAIS: marcação manual mesmo (clique pra ligar/desligar).
                    const info = im.anuncios?.[canal];
                    const ativo = !!info?.ativo;
                    const corBorda = ativo ? "var(--primary)" : "var(--border-soft)";
                    const corFundo = ativo ? "var(--primary-light)" : "var(--bg-muted)";
                    const icone = ativo ? "✅" : "⬜";
                    return (
                      <td key={canal} style={{ padding: 5, textAlign: "center" }}>
                        <button onClick={() => toggle(im, canal)} title={ativo ? `Marcado em ${info.data}` : "Clique para marcar como anunciado à mão"}
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

      <div style={{ marginTop: 14, padding: "10px 14px", background: "var(--bg-section)", borderRadius: 8, fontSize: 12, color: "var(--text-muted)" }}>
        <strong style={{ color: "var(--text)" }}>Legenda:</strong>{" "}
        <span style={{ marginRight: 14 }}>⚙ = canal de feed automático → ✅ no feed</span>
        <span style={{ marginRight: 14, color: "#dc2626" }}>❌ fora do feed (clique no ❌ pra ver o motivo)</span>
        <span>Demais canais = marcação manual: ⬜ não marcado / ✅ marcado à mão</span>
      </div>
    </div>
  );
}

// Extrai o valor comparável de cada coluna para a ordenação (texto minúsculo ou número).
function valorOrdenacao(im, col) {
  switch (col) {
    case "tipo": return (im.tipo || "").toLowerCase();
    case "status": return (statusDoImovel(im) || "").toLowerCase();
    case "cidade": return (im.cidade || "").toLowerCase();
    case "bairro": return (im.bairro || "").toLowerCase();
    case "preco": {
      const v = im.transacao === "Locação" ? im.valorFinal : im.preco;
      return parseFloat(v) || 0;
    }
    case "proprietario": return (im.nomeProprietario || "").toLowerCase();
    default:
      // Canais automáticos: 0 = no feed, 1 = fora (desc joga os "fora" pro topo).
      if (CANAIS_AUTO.includes(col)) return validarParaCanal(im, col).length > 0 ? 1 : 0;
      // Canais manuais: 0 = marcado, 1 = não marcado.
      return im.anuncios?.[col]?.ativo ? 0 : 1;
  }
}

const th = { padding: "8px 10px", textAlign: "left", position: "sticky", top: 0, zIndex: 2, background: "var(--primary)", color: "#fff" };
const thCanal = { padding: "8px 6px", textAlign: "center", fontSize: 10, whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 2, background: "var(--primary)", color: "#fff" };
const td = { padding: "8px 10px" };
const selectStyle = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-soft)", fontSize: 13, background: "var(--bg-input)", color: "var(--text)" };
const tag = (variant) => ({
  fontSize: 11,
  background: variant === "primary" ? "var(--primary-light)" : "var(--bg-muted)",
  color: variant === "primary" ? "var(--primary-dark)" : "var(--text-soft)",
  borderRadius: 6, padding: "2px 8px"
});
const backBtn = { display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", fontSize: 15, cursor: "pointer", color: "var(--primary)", fontWeight: 500, padding: 0 };
