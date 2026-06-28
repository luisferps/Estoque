import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { editarImovelBackend } from "../shared/estoqueApi";
import { TRANSACOES } from "../constants";
import { useImoveis, useTipos } from "../shared/hooks";
import { matchTransacao, statusDoImovel, validarParaCanal, CANAIS_AUTO, geocodificarEndereco } from "../shared/utils";
import { pageWrap } from "../shared/styles";

export default function Anuncios() {
  const navigate = useNavigate();
  const { imoveis } = useImoveis();
  const { tipos } = useTipos();
  const [busca, setBusca] = useState("");
  const [fTipo, setFTipo] = useState("Todos");
  const [fTransacao, setFTransacao] = useState("Todos");
  const [fCidade, setFCidade] = useState("Todas");
  const [soPendencias, setSoPendencias] = useState(false);
  const [sortCol, setSortCol] = useState("");
  const [sortDir, setSortDir] = useState("asc");

  const [migrando, setMigrando] = useState(false);
  const [migracaoTotal, setMigracaoTotal] = useState(0);
  const [migracaoAtual, setMigracaoAtual] = useState(0);
  const [migracaoNome, setMigracaoNome] = useState("");
  const [migracaoLog, setMigracaoLog] = useState({ uf: 0, coords: 0, erros: 0 });
  const [modoFila, setModoFila] = useState(false);
  const [filaIdx, setFilaIdx] = useState(0);

  const cidades = useMemo(() => ["Todas", ...Array.from(new Set(imoveis.map(im => im.cidade).filter(Boolean))).sort()], [imoveis]);

  const incompletos = useMemo(() =>
    imoveis.filter(im => !im.estado || !im.latitude || !im.longitude),
    [imoveis]
  );

  const comProblema = useMemo(() =>
    imoveis.filter(im => CANAIS_AUTO.some(c => validarParaCanal(im, c).length > 0)),
    [imoveis]
  );
  const imovelFila = modoFila ? comProblema[filaIdx] : null;

  const filtered = useMemo(() => imoveis.filter(im => {
    let matchPendencia = true;
    if (soPendencias) {
      matchPendencia = CANAIS_AUTO.some(c => validarParaCanal(im, c).length > 0);
    }
    const q = busca.trim().toLowerCase();
    const matchBusca = !q || [im.codigo, im.titulo, im.tipo, im.cidade, im.bairro, im.nomeProprietario, im.descricao]
      .some(v => (v || "").toString().toLowerCase().includes(q));

    return (fTipo === "Todos" || im.tipo === fTipo)
      && matchTransacao(im, fTransacao)
      && (fCidade === "Todas" || im.cidade === fCidade)
      && matchPendencia
      && matchBusca;
  }), [imoveis, fTipo, fTransacao, fCidade, soPendencias, busca]);

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

  // Modo fila: tela de resolver um imóvel por vez
  if (modoFila && imovelFila) {
    const problemas = CANAIS_AUTO.flatMap(canal =>
      validarParaCanal(imovelFila, canal).map(p => ({ canal, problema: p }))
    );
    return (
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "1.5rem 1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.2rem" }}>
          <button onClick={() => setModoFila(false)} style={backBtn}>← Sair da fila</button>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{filaIdx + 1} de {comProblema.length} com problema</span>
        </div>

        <div style={{ height: 6, background: "var(--bg-muted)", borderRadius: 4, marginBottom: "1.2rem" }}>
          <div style={{ height: "100%", width: `${((filaIdx) / comProblema.length) * 100}%`, background: "var(--primary)", borderRadius: 4, transition: "width 0.3s" }} />
        </div>

        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", marginBottom: "1rem" }}>
          {imovelFila.fotos?.[0] && (
            <img src={imovelFila.fotos[0]} alt="" style={{ width: "100%", height: 200, objectFit: "cover" }} />
          )}
          <div style={{ padding: "1rem 1.2rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
              <div>
                {imovelFila.codigo && <p style={{ margin: "0 0 2px", fontSize: 11, fontWeight: 700, color: "var(--primary)" }}>CÓD: {imovelFila.codigo}</p>}
                <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700, color: "var(--text)" }}>{imovelFila.titulo || imovelFila.tipo}</h3>
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>{[imovelFila.bairro, imovelFila.cidade].filter(Boolean).join(", ")}</p>
              </div>
              <button onClick={() => navigate(`/admin/editar/${imovelFila.id}`)}
                style={{ padding: "8px 16px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                ✏️ Editar imóvel
              </button>
            </div>
          </div>
        </div>

        <div style={{ background: "#fee2e2", border: "1px solid #dc2626", borderRadius: 10, padding: "1rem 1.2rem", marginBottom: "1.2rem" }}>
          <p style={{ margin: "0 0 10px", fontWeight: 700, color: "#991b1b", fontSize: 14 }}>Motivos para não subir ao feed:</p>
          {problemas.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6, fontSize: 13, color: "#7f1d1d" }}>
              <span style={{ fontWeight: 700, minWidth: 100 }}>{p.canal}:</span>
              <span>{p.problema}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setFilaIdx(i => Math.max(0, i - 1))} disabled={filaIdx === 0}
            style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "1px solid var(--border-soft)", background: "var(--bg-muted)", color: "var(--text)", cursor: filaIdx === 0 ? "default" : "pointer", fontWeight: 600, fontSize: 14 }}>
            Anterior
          </button>
          <button onClick={() => {
            if (filaIdx < comProblema.length - 1) setFilaIdx(i => i + 1);
            else { setModoFila(false); alert("Você chegou ao fim da fila!"); }
          }}
            style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
            {filaIdx < comProblema.length - 1 ? "Próximo" : "Concluir"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={pageWrap(1000)}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1rem", flexWrap: "wrap" }}>
        <button onClick={() => navigate(-1)} style={backBtn}>← Voltar</button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, flex: 1, color: "var(--primary-dark)" }}>Controle de Anúncios</h2>
        {comProblema.length > 0 && (
          <button onClick={() => { setModoFila(true); setFilaIdx(0); }}
            style={{ padding: "8px 16px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
            Resolver {comProblema.length} com problema (um por um)
          </button>
        )}
      </div>

      {incompletos.length > 0 && !migrando && (
        <div style={{ marginBottom: "1rem", padding: "12px 16px", background: "#fef3c7", border: "1px solid #d97706", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 13, color: "#78350f" }}>
            <strong>{incompletos.length} imóveis sem UF ou sem coordenadas.</strong>{" "}
            Isso impede que apareçam corretamente nos feeds.
          </div>
          <button onClick={iniciarMigracao}
            style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#d97706", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>
            Atualizar todos automaticamente
          </button>
        </div>
      )}

      {migrando && (
        <div style={{ marginBottom: "1rem", padding: "16px 20px", background: "var(--primary-light)", border: "1px solid var(--primary)", borderRadius: 8 }}>
          <div style={{ marginBottom: 10 }}>
            <strong style={{ color: "var(--primary-dark)" }}>Atualizando imóveis...</strong>
          </div>
          <div style={{ marginBottom: 8, fontSize: 12, color: "var(--text-soft)" }}>
            {migracaoAtual} de {migracaoTotal} — {migracaoNome}
          </div>
          <div style={{ height: 8, background: "var(--bg-muted)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(migracaoAtual / migracaoTotal) * 100}%`, background: "var(--primary)", transition: "width 0.3s" }} />
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>
            UF preenchidas: {migracaoLog.uf} — Coordenadas: {migracaoLog.coords} — Erros: {migracaoLog.erros}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar (código, título, bairro...)"
          style={{ ...selectStyle, minWidth: 220, flex: "1 1 220px" }}
        />
        <select value={fTipo} onChange={e => setFTipo(e.target.value)} style={selectStyle}>
          <option value="Todos">Todos os tipos</option>{tipos.map(t => <option key={t.nome}>{t.nome}</option>)}
        </select>
        <select value={fTransacao} onChange={e => setFTransacao(e.target.value)} style={selectStyle}>
          <option value="Todos">Todas as transações</option>{TRANSACOES.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={fCidade} onChange={e => setFCidade(e.target.value)} style={selectStyle}>
          {cidades.map(c => <option key={c}>{c}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-soft)", background: soPendencias ? "var(--primary-light)" : "var(--bg-input)", color: soPendencias ? "var(--primary-dark)" : "var(--text)" }}>
          <input type="checkbox" checked={soPendencias} onChange={e => setSoPendencias(e.target.checked)} style={{ width: 14, height: 14, accentColor: "var(--primary)" }} />
          Só os que não sobem
        </label>
        <span style={{ fontSize: 13, color: "var(--text-muted)", alignSelf: "center" }}>{filtered.length} imóvel(is)</span>
      </div>

      {/* Tabela — só canais automáticos, sem scroll horizontal */}
      <div style={{ border: "1px solid var(--border-soft)", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, color: "var(--text)", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "40%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "15%" }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...th, cursor: "pointer", userSelect: "none", textAlign: "left" }} onClick={() => ordenarPor("tipo")}>Imóvel{setaDe("tipo")}</th>
              <th style={{ ...th, cursor: "pointer", userSelect: "none" }} onClick={() => ordenarPor("status")}>Status{setaDe("status")}</th>
              {CANAIS_AUTO.map(c => (
                <th key={c} style={{ ...thCanal, cursor: "pointer", userSelect: "none" }} onClick={() => ordenarPor(c)}>
                  {c}{setaDe(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={2 + CANAIS_AUTO.length} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>Nenhum imóvel encontrado.</td></tr>
            )}
            {sorted.map((im, idx) => (
              <tr key={im.id} style={{ background: idx % 2 === 0 ? "var(--bg-card)" : "var(--bg-section)" }}>
                <td style={{ padding: "10px 12px" }}>
                  <button onClick={() => navigate(`/admin/editar/${im.id}`)}
                    style={{ background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer", textAlign: "left", font: "inherit", color: "var(--text)", width: "100%" }}>
                    {im.codigo && <div style={{ fontSize: 11, fontWeight: 700, color: "var(--primary)" }}>{im.codigo}</div>}
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 2 }}>
                      <span style={tagStyle("primary")}>{im.tipo}</span>
                      {im.transacao && <span style={tagStyle()}>{im.transacao}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {im.titulo || [im.bairro, im.cidade].filter(Boolean).join(", ")}
                    </div>
                  </button>
                </td>
                <td style={{ padding: "10px 8px", textAlign: "center", fontSize: 12 }}>{statusDoImovel(im)}</td>
                {CANAIS_AUTO.map(canal => {
                  const problemas = validarParaCanal(im, canal);
                  const noFeed = problemas.length === 0;
                  return (
                    <td key={canal} style={{ padding: "6px 8px", textAlign: "center" }}>
                      <button
                        onClick={() => { if (!noFeed) alert(`${canal} — fora do feed:\n\n• ${problemas.join("\n• ")}`); }}
                        title={noFeed ? `${canal} — no feed` : `${canal}:\n• ${problemas.join("\n• ")}`}
                        style={{
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                          background: noFeed ? "var(--primary-light)" : "#fee2e2",
                          border: `1px solid ${noFeed ? "var(--primary)" : "#dc2626"}`,
                          borderRadius: 8, padding: "6px 8px", cursor: noFeed ? "default" : "pointer",
                          width: "100%", color: "var(--text)"
                        }}>
                        <span style={{ fontSize: 15 }}>{noFeed ? "✅" : "❌"}</span>
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{noFeed ? "no feed" : "fora"}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
        ✅ no feed — imóvel publicado no portal | ❌ fora — clique para ver o motivo
      </div>
    </div>
  );
}

function valorOrdenacao(im, col) {
  switch (col) {
    case "tipo": return (im.tipo || "").toLowerCase();
    case "status": return (statusDoImovel(im) || "").toLowerCase();
    default:
      if (CANAIS_AUTO.includes(col)) return validarParaCanal(im, col).length > 0 ? 1 : 0;
      return 0;
  }
}

const th = { padding: "10px 12px", textAlign: "center", position: "sticky", top: 0, zIndex: 2, background: "var(--primary)", color: "#fff", fontSize: 13 };
const thCanal = { padding: "10px 8px", textAlign: "center", fontSize: 12, whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 2, background: "var(--primary)", color: "#fff" };
const selectStyle = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-soft)", fontSize: 13, background: "var(--bg-input)", color: "var(--text)" };
const tagStyle = (variant) => ({
  fontSize: 11,
  background: variant === "primary" ? "var(--primary-light)" : "var(--bg-muted)",
  color: variant === "primary" ? "var(--primary-dark)" : "var(--text-soft)",
  borderRadius: 6, padding: "2px 6px"
});
const backBtn = { display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", fontSize: 15, cursor: "pointer", color: "var(--primary)", fontWeight: 500, padding: 0 };
