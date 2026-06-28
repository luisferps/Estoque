import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { editarImovelBackend } from "../shared/estoqueApi";
import { TRANSACOES } from "../constants";
import { useImoveis, useTipos } from "../shared/hooks";
import { matchTransacao, statusDoImovel, validarParaCanal, avisosDoCanal, CANAIS_AUTO, geocodificarEndereco } from "../shared/utils";
import { pageWrap } from "../shared/styles";

// Canais mostrados na tabela (com nome curto pra caber tudo numa tela).
// Os 3 primeiros são automáticos (feed XML). Os demais são marcação manual.
const CANAIS_TABELA = [
  { nome: "Canal Pro", abrev: "Canal Pro", auto: true },
  { nome: "Chaves na Mão", abrev: "Chaves", auto: true },
  { nome: "Catálogo Meta", abrev: "Meta", auto: true },
  { nome: "Instagram Post", abrev: "IG Post", auto: false },
  { nome: "Instagram Story", abrev: "IG Story", auto: false },
  { nome: "WhatsApp Grupos", abrev: "Wpp Grupos", auto: false },
  { nome: "Marketplace Facebook", abrev: "MktFace", auto: false },
];

const STATUS_OPCOES = ["Disponível", "Reservado", "Vendido", "Aguardando finalização"];

export default function Anuncios() {
  const navigate = useNavigate();
  const { imoveis } = useImoveis();
  const { tipos } = useTipos();
  const [busca, setBusca] = useState("");
  const [fTipo, setFTipo] = useState("Todos");
  const [fTransacao, setFTransacao] = useState("Todos");
  const [fCidade, setFCidade] = useState("Todas");
  const [fStatus, setFStatus] = useState("Todos");
  const [fForaDe, setFForaDe] = useState("");   // canal: mostra só os fora desse canal
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

  // Canais automáticos para checagem de "fora do feed".
  const comProblema = useMemo(() =>
    imoveis.filter(im => CANAIS_AUTO.some(c => validarParaCanal(im, c).length > 0)),
    [imoveis]
  );
  const imovelFila = modoFila ? comProblema[filaIdx] : null;

  const filtered = useMemo(() => imoveis.filter(im => {
    const q = busca.trim().toLowerCase();
    const matchBusca = !q || [im.codigo, im.titulo, im.tipo, im.cidade, im.bairro, im.nomeProprietario, im.descricao]
      .some(v => (v || "").toString().toLowerCase().includes(q));

    // Filtro "fora de qual canal": mostra só imóveis que estão FORA do canal escolhido.
    let matchForaDe = true;
    if (fForaDe) matchForaDe = validarParaCanal(im, fForaDe).length > 0;

    return (fTipo === "Todos" || im.tipo === fTipo)
      && matchTransacao(im, fTransacao)
      && (fCidade === "Todas" || im.cidade === fCidade)
      && (fStatus === "Todos" || statusDoImovel(im) === fStatus)
      && matchForaDe
      && matchBusca;
  }), [imoveis, fTipo, fTransacao, fCidade, fStatus, fForaDe, busca]);

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

  // ─── MODO FILA: resolver um imóvel por vez, com campos prontos pra preencher ───
  if (modoFila && imovelFila) {
    return (
      <FilaResolver
        imovel={imovelFila}
        idx={filaIdx}
        total={comProblema.length}
        onSair={() => setModoFila(false)}
        onAnterior={() => setFilaIdx(i => Math.max(0, i - 1))}
        onProximo={() => {
          if (filaIdx < comProblema.length - 1) setFilaIdx(i => i + 1);
          else { setModoFila(false); alert("Você chegou ao fim da fila!"); }
        }}
        navigate={navigate}
      />
    );
  }

  return (
    <div style={pageWrap(1100)}>
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
          placeholder="Buscar (código, título, bairro, proprietário...)"
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
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={selectStyle}>
          <option value="Todos">Todos os status</option>
          {STATUS_OPCOES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={fForaDe} onChange={e => setFForaDe(e.target.value)} style={selectStyle}>
          <option value="">Todos os anúncios</option>
          {CANAIS_AUTO.map(c => <option key={c} value={c}>Fora de: {c}</option>)}
        </select>
        <span style={{ fontSize: 13, color: "var(--text-muted)", alignSelf: "center" }}>{filtered.length} imóvel(is)</span>
      </div>

      {/* Tabela — coluna Imóvel enxuta + 7 canais abreviados, tudo numa tela */}
      <div style={{ border: "1px solid var(--border-soft)", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, color: "var(--text)", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "20%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "9.8%" }} />
            <col style={{ width: "9.8%" }} />
            <col style={{ width: "9.8%" }} />
            <col style={{ width: "9.8%" }} />
            <col style={{ width: "9.8%" }} />
            <col style={{ width: "10%" }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...th, cursor: "pointer", userSelect: "none", textAlign: "left" }} onClick={() => ordenarPor("tipo")}>Imóvel{setaDe("tipo")}</th>
              <th style={{ ...th, cursor: "pointer", userSelect: "none" }} onClick={() => ordenarPor("status")}>Status{setaDe("status")}</th>
              {CANAIS_TABELA.map(c => (
                <th key={c.nome} style={{ ...thCanal, cursor: c.auto ? "pointer" : "default", userSelect: "none" }}
                  onClick={() => c.auto && ordenarPor(c.nome)} title={c.nome}>
                  {c.abrev}{c.auto && setaDe(c.nome)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={2 + CANAIS_TABELA.length} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>Nenhum imóvel encontrado.</td></tr>
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
                    {im.nomeProprietario && (
                      <div style={{ fontSize: 11.5, color: "var(--text-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        👤 {im.nomeProprietario}
                      </div>
                    )}
                  </button>
                </td>
                <td style={{ padding: "10px 8px", textAlign: "center", fontSize: 12 }}>{statusDoImovel(im)}</td>
                {CANAIS_TABELA.map(canal => {
                  if (canal.auto) {
                    // Canal automático: ✅ no feed / ❌ fora (com motivo real)
                    const problemas = validarParaCanal(im, canal.nome);
                    const noFeed = problemas.length === 0;
                    return (
                      <td key={canal.nome} style={{ padding: "6px 6px", textAlign: "center" }}>
                        <button
                          onClick={() => { if (!noFeed) alert(`${canal.nome} — fora do feed:\n\n• ${problemas.join("\n• ")}`); }}
                          title={noFeed ? `${canal.nome} — no feed` : `${canal.nome}:\n• ${problemas.join("\n• ")}`}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: noFeed ? "var(--primary-light)" : "#fee2e2",
                            border: `1px solid ${noFeed ? "var(--primary)" : "#dc2626"}`,
                            borderRadius: 7, padding: "7px 4px", cursor: noFeed ? "default" : "pointer",
                            width: "100%", color: "var(--text)"
                          }}>
                          <span style={{ fontSize: 14 }}>{noFeed ? "✅" : "❌"}</span>
                        </button>
                      </td>
                    );
                  }
                  // Canal manual: marcação ⬜ / ✔ (clica para alternar)
                  const ativo = !!(im.anuncios && im.anuncios[canal.nome] && im.anuncios[canal.nome].ativo);
                  return (
                    <td key={canal.nome} style={{ padding: "6px 6px", textAlign: "center" }}>
                      <CanalManual im={im} canal={canal.nome} ativo={ativo} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
        <strong>Automáticos</strong> (Canal Pro, Chaves, Meta): ✅ no feed | ❌ fora — clique pra ver o motivo real.<br />
        <strong>Manuais</strong> (IG, Wpp, MktFace): ✔ marcado / ⬜ não — clique pra registrar onde você já publicou.
      </div>
    </div>
  );
}

// ─── Botão de canal manual: registra onde você já anunciou à mão ───
function CanalManual({ im, canal, ativo }) {
  const [on, setOn] = useState(ativo);
  const [salvando, setSalvando] = useState(false);
  const alternar = async () => {
    const novo = !on;
    setOn(novo);
    setSalvando(true);
    try {
      const anuncios = { ...(im.anuncios || {}) };
      anuncios[canal] = { ...(anuncios[canal] || {}), ativo: novo, data: novo ? new Date().toLocaleDateString("pt-BR") : "" };
      await editarImovelBackend(im.id, { anuncios });
    } catch {
      setOn(!novo); // desfaz visualmente se falhar
      alert("Não consegui salvar. Tente de novo.");
    }
    setSalvando(false);
  };
  return (
    <button onClick={alternar} disabled={salvando}
      title={on ? `${canal}: marcado como publicado` : `${canal}: clique para marcar como publicado`}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        background: on ? "var(--primary-light)" : "var(--bg-muted)",
        border: `1px solid ${on ? "var(--primary)" : "var(--border-soft)"}`,
        borderRadius: 7, padding: "7px 4px", cursor: salvando ? "default" : "pointer",
        width: "100%", color: "var(--text)", opacity: salvando ? 0.5 : 1
      }}>
      <span style={{ fontSize: 14 }}>{on ? "✔" : "⬜"}</span>
    </button>
  );
}

// ─── Tela da fila: resolve os problemas do imóvel com campos prontos ───
function FilaResolver({ imovel, idx, total, onSair, onAnterior, onProximo, navigate }) {
  // Campos editáveis locais, iniciados com o valor atual do imóvel
  const [form, setForm] = useState({
    status: imovel.status || "Disponível",
    visibilidade: imovel.visibilidade || "",
    cidade: imovel.cidade || "",
    bairro: imovel.bairro || "",
    estado: imovel.estado || "",
    cep: imovel.cep || "",
    quartos: imovel.quartos || "",
    banheiros: imovel.banheiros || "",
    metragem: imovel.metragem || "",
    descricao: imovel.descricao || "",
    preco: imovel.preco || "",
    valorAluguel: imovel.valorAluguel || "",
  });
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const sf = (campo, valor) => { setForm(p => ({ ...p, [campo]: valor })); setSalvo(false); };

  // Junta o imóvel + as edições para recalcular o que ainda falta
  const imovelEditado = { ...imovel, ...form };
  const bloqueios = CANAIS_AUTO.flatMap(canal =>
    validarParaCanal(imovelEditado, canal).map(p => ({ canal, problema: p }))
  );
  const avisos = CANAIS_AUTO.flatMap(canal =>
    avisosDoCanal(imovelEditado, canal).map(p => ({ canal, problema: p }))
  );

  // Quais campos mostrar: detecta pelos problemas que ainda existem
  const txtBloqueios = bloqueios.map(b => b.problema).join(" | ");
  const txtAvisos = avisos.map(a => a.problema).join(" | ");
  const todos = (txtBloqueios + " | " + txtAvisos).toLowerCase();
  const precisa = (palavra) => todos.includes(palavra);

  const trans = imovelEditado.transacao || "";
  const isVenda = trans === "Venda" || trans === "Venda e Locação";
  const isLocacao = trans === "Locação";

  const salvar = async (irProximo) => {
    setSalvando(true);
    try {
      // Só envia os campos que mudaram em relação ao imóvel original
      const updates = {};
      Object.keys(form).forEach(k => {
        const orig = imovel[k] != null ? String(imovel[k]) : "";
        if (String(form[k]) !== orig) updates[k] = form[k];
      });
      if (Object.keys(updates).length > 0) {
        await editarImovelBackend(imovel.id, updates);
      }
      setSalvo(true);
      setSalvando(false);
      if (irProximo) onProximo();
    } catch (e) {
      setSalvando(false);
      alert("Erro ao salvar: " + e.message);
    }
  };

  const tudoResolvido = bloqueios.length === 0;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem 1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1rem" }}>
        <button onClick={onSair} style={backBtn}>← Sair da fila</button>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{idx + 1} de {total} com problema</span>
      </div>

      <div style={{ height: 6, background: "var(--bg-muted)", borderRadius: 4, marginBottom: "1.2rem" }}>
        <div style={{ height: "100%", width: `${(idx / total) * 100}%`, background: "var(--primary)", borderRadius: 4, transition: "width 0.3s" }} />
      </div>

      {/* Cabeçalho do imóvel */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", marginBottom: "1rem" }}>
        {imovel.fotos?.[0] && <img src={imovel.fotos[0]} alt="" style={{ width: "100%", height: 160, objectFit: "cover" }} />}
        <div style={{ padding: "0.9rem 1.1rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
          <div>
            {imovel.codigo && <p style={{ margin: "0 0 2px", fontSize: 11, fontWeight: 700, color: "var(--primary)" }}>CÓD: {imovel.codigo}</p>}
            <h3 style={{ margin: "0 0 2px", fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{imovel.titulo || imovel.tipo}</h3>
            {imovel.nomeProprietario && <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>👤 {imovel.nomeProprietario}</p>}
          </div>
          <button onClick={() => navigate(`/admin/editar/${imovel.id}`)}
            style={{ padding: "7px 14px", background: "var(--bg-muted)", color: "var(--text)", border: "1px solid var(--border-soft)", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 12 }}>
            Abrir ficha completa
          </button>
        </div>
      </div>

      {/* Campos pra resolver */}
      <div style={{ background: tudoResolvido ? "#dcfce7" : "#fff7ed", border: `1px solid ${tudoResolvido ? "#16a34a" : "#d97706"}`, borderRadius: 12, padding: "1.1rem 1.2rem", marginBottom: "1.2rem" }}>
        <p style={{ margin: "0 0 14px", fontWeight: 700, color: tudoResolvido ? "#166534" : "#9a3412", fontSize: 14 }}>
          {tudoResolvido ? "✓ Sem bloqueios — pode salvar e seguir" : "Preencha o que falta para subir aos portais:"}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Status */}
          {precisa("status não está") && (
            <Campo label="Status">
              <select value={form.status} onChange={e => sf("status", e.target.value)} style={inputFila}>
                {STATUS_OPCOES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Campo>
          )}

          {/* Visibilidade */}
          {precisa("visibilidade está ocultando") && (
            <Campo label="Visibilidade nos portais">
              <select value={form.visibilidade} onChange={e => sf("visibilidade", e.target.value)} style={inputFila}>
                <option value="">Mostrar em tudo (site + portais)</option>
                <option value="Ocultar do site">Ocultar só do site (continua nos portais)</option>
                <option value="Ocultar dos portais">Ocultar só dos portais</option>
                <option value="Ocultar de tudo">Ocultar de tudo</option>
              </select>
            </Campo>
          )}

          {/* Cidade */}
          {precisa("cidade") && (
            <Campo label="Cidade">
              <input value={form.cidade} onChange={e => sf("cidade", e.target.value)} placeholder="Ex: Goiânia" style={inputFila} />
            </Campo>
          )}

          {/* Bairro */}
          {precisa("bairro") && (
            <Campo label="Bairro / Setor">
              <input value={form.bairro} onChange={e => sf("bairro", e.target.value)} placeholder="Ex: Setor Bueno" style={inputFila} />
            </Campo>
          )}

          {/* Estado / UF */}
          {precisa("estado (uf)") && (
            <Campo label="Estado (UF)">
              <input value={form.estado} onChange={e => sf("estado", e.target.value.toUpperCase().slice(0, 2))} placeholder="Ex: GO" style={inputFila} />
            </Campo>
          )}

          {/* CEP (aviso) */}
          {precisa("cep") && (
            <Campo label="CEP">
              <input value={form.cep} onChange={e => sf("cep", e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="8 dígitos" inputMode="numeric" style={inputFila} />
            </Campo>
          )}

          {/* Quartos */}
          {precisa("quartos") && (
            <Campo label="Quartos">
              <input value={form.quartos} onChange={e => sf("quartos", e.target.value.replace(/\D/g, ""))} placeholder="Ex: 3" inputMode="numeric" style={inputFila} />
            </Campo>
          )}

          {/* Banheiros */}
          {precisa("banheiros") && (
            <Campo label="Banheiros">
              <input value={form.banheiros} onChange={e => sf("banheiros", e.target.value.replace(/\D/g, ""))} placeholder="Ex: 2" inputMode="numeric" style={inputFila} />
            </Campo>
          )}

          {/* Metragem */}
          {precisa("metragem") && (
            <Campo label="Metragem (m²)">
              <input value={form.metragem} onChange={e => sf("metragem", e.target.value.replace(/[^\d.]/g, ""))} placeholder="Ex: 80" inputMode="numeric" style={inputFila} />
            </Campo>
          )}

          {/* Preço de venda */}
          {precisa("preço de venda") && isVenda && (
            <Campo label="Preço de venda (R$)">
              <input value={form.preco} onChange={e => sf("preco", e.target.value.replace(/[^\d.]/g, ""))} placeholder="Ex: 350000" inputMode="numeric" style={inputFila} />
            </Campo>
          )}

          {/* Valor do aluguel */}
          {precisa("valor do aluguel") && isLocacao && (
            <Campo label="Valor do aluguel (R$)">
              <input value={form.valorAluguel} onChange={e => sf("valorAluguel", e.target.value.replace(/[^\d.]/g, ""))} placeholder="Ex: 2500" inputMode="numeric" style={inputFila} />
            </Campo>
          )}

          {/* Descrição */}
          {precisa("descrição") && (
            <Campo label="Descrição (mínimo 50 caracteres)">
              <textarea value={form.descricao} onChange={e => sf("descricao", e.target.value)} rows={4}
                placeholder="Descreva o imóvel..." style={{ ...inputFila, resize: "vertical", minHeight: 80 }} />
              <span style={{ fontSize: 11, color: form.descricao.trim().length >= 50 ? "#16a34a" : "var(--text-muted)" }}>
                {form.descricao.trim().length} caracteres
              </span>
            </Campo>
          )}

          {/* Coordenadas (Meta) — não dá pra digitar aqui, manda pra ficha */}
          {precisa("coordenadas não foram encontradas") && (
            <div style={{ fontSize: 12.5, color: "#9a3412", background: "#ffedd5", borderRadius: 8, padding: "8px 12px" }}>
              As coordenadas são calculadas pelo endereço. Preencha cidade/bairro corretos e salve, ou ajuste o pino na ficha completa (campo "Coordenada do mapa").
            </div>
          )}
        </div>
      </div>

      {/* Avisos de qualidade restantes (não bloqueiam) */}
      {avisos.length > 0 && (
        <details style={{ marginBottom: "1.2rem" }}>
          <summary style={{ fontSize: 12.5, color: "var(--text-muted)", cursor: "pointer" }}>
            {avisos.length} aviso(s) de qualidade — não impedem de subir
          </summary>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
            {avisos.map((a, i) => (
              <div key={i} style={{ fontSize: 12, color: "var(--text-muted)" }}>• {a.problema} <span style={{ opacity: 0.6 }}>({a.canal})</span></div>
            ))}
          </div>
        </details>
      )}

      {/* Ações */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={onAnterior} disabled={idx === 0}
          style={{ flex: "1 1 90px", padding: "12px 0", borderRadius: 10, border: "1px solid var(--border-soft)", background: "var(--bg-muted)", color: "var(--text)", cursor: idx === 0 ? "default" : "pointer", fontWeight: 600, fontSize: 14, opacity: idx === 0 ? 0.5 : 1 }}>
          Anterior
        </button>
        <button onClick={() => salvar(false)} disabled={salvando}
          style={{ flex: "1 1 90px", padding: "12px 0", borderRadius: 10, border: "1px solid var(--primary)", background: salvo ? "#16a34a" : "var(--primary-light)", color: salvo ? "#fff" : "var(--primary-dark)", cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
          {salvando ? "Salvando..." : salvo ? "✓ Salvo" : "Salvar"}
        </button>
        <button onClick={() => salvar(true)} disabled={salvando}
          style={{ flex: "1 1 120px", padding: "12px 0", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
          {idx < total - 1 ? "Salvar e próximo" : "Salvar e concluir"}
        </button>
      </div>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-soft)" }}>{label}</span>
      {children}
    </label>
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

const th = { padding: "10px 8px", textAlign: "center", position: "sticky", top: 0, zIndex: 2, background: "var(--primary)", color: "#fff", fontSize: 12.5 };
const thCanal = { padding: "10px 4px", textAlign: "center", fontSize: 11, whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 2, background: "var(--primary)", color: "#fff" };
const selectStyle = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-soft)", fontSize: 13, background: "var(--bg-input)", color: "var(--text)" };
const inputFila = { padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14, background: "var(--bg-card)", color: "var(--text)", width: "100%", boxSizing: "border-box" };
const tagStyle = (variant) => ({
  fontSize: 11,
  background: variant === "primary" ? "var(--primary-light)" : "var(--bg-muted)",
  color: variant === "primary" ? "var(--primary-dark)" : "var(--text-soft)",
  borderRadius: 6, padding: "2px 6px"
});
const backBtn = { display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", fontSize: 15, cursor: "pointer", color: "var(--primary)", fontWeight: 500, padding: 0 };
