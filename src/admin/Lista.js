import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { excluirImovelBackend, editarImovelBackend } from "../shared/estoqueApi";
import { db } from "../firebase";
import { useImoveis, useTipos } from "../shared/hooks";
import { useUserRole, ehDiretorEfetivo, usuarioSSO } from "../shared/userRole";
import { matchTransacao, ordenarImoveis, statusDoImovel, reservarCodigoImovel, ajustarContadorMinimo, chaveBairro, descricaoPronta, gerarPDF } from "../shared/utils";
import { PDF_CAMPOS, TRANSACOES, STATUS_IMOVEL, ORDENACOES } from "../constants";

export default function Lista({ onLogout }) {
  const navigate = useNavigate();
  const { imoveis, loading } = useImoveis();
  const { tipos } = useTipos();
  const { user, perfil, isAdmin } = useUserRole();
  const ehDiretor = ehDiretorEfetivo(isAdmin);
  const meuEmail = usuarioSSO();
  const _meuNome = String((perfil && perfil.nome) || "").toLowerCase().trim();
  const _norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  // "Meu" imóvel = tenho a estrela OU participo da divisão de captação (por email ou nome).
  // Cobre o captador que finaliza o próprio imóvel mesmo sem ser a estrela.
  const souDonoDe = (im) => !!(
    (meuEmail && im.captadorEmail && im.captadorEmail.toLowerCase() === meuEmail) ||
    (user && im.captadorUid && im.captadorUid === user.uid) ||
    (meuEmail && Array.isArray(im.captadores_detalhes) && im.captadores_detalhes.some(c =>
      c && c.tipo === "interno" && c.email && String(c.email).toLowerCase() === meuEmail)) ||
    (_meuNome && Array.isArray(im.captadores_detalhes) && im.captadores_detalhes.some(c =>
      c && c.tipo === "interno" && _norm(c.nome) === _norm(_meuNome)))
  );
  const [search, setSearch] = useState("");
  const [tipo, setTipo] = useState("Todos");
  const [transacao, setTransacao] = useState("Todos");
  const [cidade, setCidade] = useState("Todas");
  const [bairro, setBairro] = useState("Todos");
  const [status, setStatus] = useState("Todos");
  const [ordem, setOrdem] = useState("recente");
  const [precoMin, setPrecoMin] = useState("");
  const [precoMax, setPrecoMax] = useState("");
  const [showPDF, setShowPDF] = useState(false);
  const [pdfCampos, setPdfCampos] = useState(PDF_CAMPOS.map(c => c.key));
  const [migrando, setMigrando] = useState(false);
  const [soMinhas, setSoMinhas] = useState(false);

  const cidades = useMemo(() => ["Todas", ...Array.from(new Set(imoveis.map(im => im.cidade).filter(Boolean))).sort()], [imoveis]);

  const bairros = useMemo(() => {
    const base = cidade === "Todas" ? imoveis : imoveis.filter(im => im.cidade === cidade);
    return ["Todos", ...Array.from(new Set(base.map(im => im.bairro).filter(Boolean))).sort()];
  }, [imoveis, cidade]);

  useEffect(() => {
    if (bairro !== "Todos" && !bairros.includes(bairro)) setBairro("Todos");
  }, [bairros, bairro]);

  const semCodigo = useMemo(() => imoveis.filter(im => !(im.codigo || "").trim()).length, [imoveis]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const min = parseFloat(String(precoMin).replace(/[^\d]/g, "")) || 0;
    const max = parseFloat(String(precoMax).replace(/[^\d]/g, "")) || Infinity;
    const precoOk = (im) => {
      if (!precoMin && !precoMax) return true;
      const v = parseFloat(im.preco) || parseFloat(im.valorAluguel) || parseFloat(im.valorFinal) || 0;
      return v >= min && v <= max;
    };
    const base = imoveis.filter(im =>
      (!q || (im.titulo || "").toLowerCase().includes(q) || (im.descricao || "").toLowerCase().includes(q) || (im.cidade || "").toLowerCase().includes(q) || (im.bairro || "").toLowerCase().includes(q) || (im.endereco || "").toLowerCase().includes(q) || (im.codigo || "").toLowerCase().includes(q) || (im.nomeProprietario || "").toLowerCase().includes(q))
      && (tipo === "Todos" || im.tipo === tipo)
      && matchTransacao(im, transacao)
      && (cidade === "Todas" || im.cidade === cidade)
      && (bairro === "Todos" || im.bairro === bairro)
      && (status === "Todos" || statusDoImovel(im) === status)
      && precoOk(im)
      // Botão "Minhas captações": mostra só os imóveis captados pelo usuário logado.
      && (!soMinhas || souDonoDe(im))
      // Imóveis PRONTOS: todos veem. "Aguardando finalização" (rascunho) só aparece pro
      // captador dele (que precisa finalizar) e pro diretor — não polui a lista dos outros.
      && (im.status !== "Aguardando finalização" || ehDiretor || souDonoDe(im))
    );
    return ordenarImoveis(base, ordem);
  }, [imoveis, search, tipo, transacao, cidade, bairro, status, ordem, precoMin, precoMax, ehDiretor, meuEmail, user, soMinhas]);

  const del = async (id) => {
    if (!window.confirm("Excluir?")) return;
    try { await excluirImovelBackend(id); }
    catch (e) { alert("Erro ao excluir: " + e.message); }
  };

  // Abre a página pública do imóvel em nova aba.
  const verNoSite = (im) => {
    window.open(`${window.location.origin}/imovel/${im.id}`, "_blank");
  };

  // Copia a descrição pronta (mesma função da ficha) pro WhatsApp.
  const [copiadoId, setCopiadoId] = useState(null);
  const copiarDescricao = async (im) => {
    const txt = descricaoPronta(im);
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
    setCopiadoId(im.id);
    setTimeout(() => setCopiadoId(null), 2000);
  };

  // Gera código para todos os imóveis que ainda não têm, usando o contador persistente.
  // Primeiro inicializa os contadores com base nos códigos JÁ existentes (para não repetir),
  // depois reserva (atômico) um código novo para cada imóvel sem código.
  const gerarCodigosFaltantes = async () => {
    const faltantes = imoveis
      .filter(im => !(im.codigo || "").trim() && (im.bairro || "").trim())
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    const semBairro = imoveis.filter(im => !(im.codigo || "").trim() && !(im.bairro || "").trim()).length;

    if (faltantes.length === 0) {
      alert(semBairro > 0
        ? `Nenhum imóvel para gerar.\n\n${semBairro} imóvel(is) estão sem código E sem bairro — preencha o bairro deles primeiro.`
        : "Todos os imóveis já têm código. Nada a fazer.");
      return;
    }

    const aviso = `Vou gerar código para ${faltantes.length} imóvel(is) sem código.\n`
      + `Os que já têm código não serão alterados.\n`
      + (semBairro > 0 ? `\n⚠️ ${semBairro} imóvel(is) sem bairro serão ignorados.\n` : "")
      + `\nDeseja continuar?`;
    if (!window.confirm(aviso)) return;

    setMigrando(true);
    let feitos = 0, erros = 0;
    try {
      // 1) Inicializa contadores com base nos maiores números já usados em cada bairro
      //    (assim os códigos novos nunca colidem com os existentes).
      const maxPorBairro = {}; // chaveBairro -> maior numero usado (base conta como 1)
      for (const im of imoveis) {
        const cod = (im.codigo || "").trim();
        const bai = (im.bairro || "").trim();
        if (!cod || !bai) continue;
        const ch = chaveBairro(bai);
        const esc = bai.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const m = cod.match(new RegExp("^" + esc + "(?:\\s+(\\d+))?$", "i"));
        const n = m ? (m[1] ? parseInt(m[1], 10) : 1) : 1; // se nao casa, conta como ocupando 1
        if (!maxPorBairro[ch] || n > maxPorBairro[ch].n) maxPorBairro[ch] = { n, bairro: bai };
      }
      for (const ch of Object.keys(maxPorBairro)) {
        await ajustarContadorMinimo(db, maxPorBairro[ch].bairro, maxPorBairro[ch].n);
      }

      // 2) Reserva um código novo (atômico) para cada imóvel sem código.
      // Monta o conjunto de códigos JÁ usados pra garantir unicidade mesmo se o contador dessincronizar.
      const usados = new Set(
        imoveis.map(im => (im.codigo || "").trim().toLowerCase()).filter(Boolean)
      );
      for (const im of faltantes) {
        try {
          const codigo = await reservarCodigoImovel(db, im.bairro, usados);
          await editarImovelBackend(im.id, { codigo });
          feitos++;
        } catch (e) { erros++; }
      }
    } catch (e) {
      alert("Erro na migração: " + e.message);
    }
    setMigrando(false);
    alert(`Pronto!\n${feitos} código(s) gerado(s).` + (erros ? `\n${erros} falha(s).` : ""));
  };


  const badgeStatus = (im) => {
    const s = statusDoImovel(im);
    if (s === "Disponível") return { txt: "Disponível", bg: "rgba(37,136,79,0.92)" };
    if (s === "Reservado") return { txt: "Reservado", bg: "rgba(37,99,235,0.92)" };
    if (s === "Vendido") return { txt: "Vendido", bg: "rgba(120,120,128,0.92)" };
    if (s === "Alugado") return { txt: "Alugado", bg: "rgba(120,120,128,0.92)" };
    if (im.status === "Aguardando finalização") return { txt: "Aguardando", bg: "rgba(217,119,6,0.92)" };
    return { txt: s, bg: "rgba(120,120,128,0.92)" };
  };

  const cardDe = (im) => {
    const codigo = (im.codigo == null ? "" : String(im.codigo)).trim().toUpperCase();
    const local = [im.bairro, im.cidade].filter(Boolean).join(", ");
    const tituloRaw = String(im.titulo == null ? "" : im.titulo).trim();
    const titulo = tituloRaw || (im.tipo ? (im.bairro ? `${im.tipo} em ${im.bairro}` : im.tipo) : "Imóvel");
    const c = parseFloat(im.metragem) || parseFloat(im.metragemTotal) || 0;
    const m2 = c ? `${c.toLocaleString("pt-BR")}m²` : "";
    const q = parseInt(im.quartos) || 0;
    const su = parseInt(im.suites) || 0;
    const va = parseInt(im.garagens) || 0;
    const foto = im.fotos?.[0];
    const fotoThumb = (foto && foto.includes("res.cloudinary.com") && foto.includes("/upload/"))
      ? foto.replace("/upload/", "/upload/w_500,h_300,c_fill,f_auto,q_auto/") : foto;
    const ehLoc = im.transacao === "Locação";
    const preco = ehLoc ? (im.valorFinal || im.valorAluguel) : im.preco;
    const bs = badgeStatus(im);
    const podeEditar = ehDiretor || souDonoDe(im);

    return (
      <div className="al-card" key={im.id}>
        <div className="al-card-img" onClick={() => navigate(`/admin/imovel/${im.id}`)}>
          {fotoThumb
            ? <img src={fotoThumb} alt="" loading="lazy" />
            : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, opacity: 0.35 }}>🏠</div>}
          <span className="al-badge" style={{ background: bs.bg }}>{bs.txt}</span>
          {codigo && <span className="al-cod">{codigo}</span>}
        </div>
        <div className="al-card-body" onClick={() => navigate(`/admin/imovel/${im.id}`)}>
          <div className="al-loc">{local || "—"}</div>
          <div className="al-title">{titulo}</div>
          <div className="al-specs">
            {q > 0 && <span>🛏 {q}</span>}
            {su > 0 && <span>🚿 {su}</span>}
            {va > 0 && <span>🚗 {va}</span>}
            {m2 && <span>📐 {m2}</span>}
          </div>
          <div className="al-price">
            {preco ? <>R$ {parseFloat(preco).toLocaleString("pt-BR")}{ehLoc && <small> /mês</small>}</> : <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400 }}>Sem valor</span>}
          </div>
        </div>
        <div className="al-actions">
          <button className="al-mini al-ficha" onClick={() => navigate(`/admin/imovel/${im.id}`)}>Ficha</button>
          <button className="al-mini" onClick={() => verNoSite(im)} title="Ver no site">🌐</button>
          <button className="al-mini" onClick={() => copiarDescricao(im)} title="Copiar descrição"
            style={copiadoId === im.id ? { background: "#25884f", color: "#fff", borderColor: "#25884f" } : null}>{copiadoId === im.id ? "✓" : "📝"}</button>
          {podeEditar && <>
            <button className="al-mini" onClick={() => navigate(`/admin/editar/${im.id}`)} title="Editar">✏️</button>
            <button className="al-mini al-del" onClick={() => del(im.id)} title="Excluir">🗑️</button>
          </>}
        </div>
      </div>
    );
  };

  return (
    <div className="admin-lista">
      <style>{`
        .admin-lista { max-width: 1200px; margin: 0 auto; padding: 22px 20px 60px; }
        .admin-lista * { box-sizing: border-box; }
        .al-toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
        .al-toolbar h2 { font-size: 24px; font-weight: 600; letter-spacing: -0.02em; margin: 0 auto 0 0; color: var(--text); }
        .al-btn-soft { background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 9px 16px; font-size: 13.5px; color: var(--text); cursor: pointer; font-weight: 500; display: inline-flex; align-items: center; gap: 6px; }
        .al-btn-soft:hover { border-color: var(--primary-border); }
        .al-btn-soft:disabled { opacity: 0.5; cursor: default; }
        .al-aviso { background: #fff8e1; border: 1px solid #f0d98c; color: #8a6d3b; border-radius: 12px; padding: 11px 16px; font-size: 13px; margin-bottom: 14px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .al-aviso button { margin-left: auto; background: var(--primary); color: #fff; border: none; border-radius: 8px; padding: 6px 14px; font-size: 12.5px; font-weight: 600; cursor: pointer; }
        .al-aviso button:disabled { opacity: 0.6; cursor: default; }
        .al-filtros { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; padding: 14px; margin-bottom: 16px; }
        .al-filtros-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
        .al-search { flex: 1 1 240px; display: flex; align-items: center; gap: 8px; background: var(--bg-muted); border-radius: 10px; padding: 9px 14px; }
        .al-search input { border: none; outline: none; background: transparent; font-size: 14px; width: 100%; color: var(--text); }
        .al-sel { border: 1px solid var(--border); background: var(--bg-card); border-radius: 10px; padding: 9px 13px; font-size: 13.5px; color: var(--text); cursor: pointer; font-family: inherit; outline: none; }
        .al-price { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .al-price input { width: 120px; padding: 9px 11px; border-radius: 10px; border: 1px solid var(--border); font-size: 13.5px; background: var(--bg-input); color: var(--text); outline: none; }
        .al-price input:focus, .al-search input:focus { outline: none; }
        .al-price span { color: var(--text-muted); font-size: 13px; }
        .al-clearprice { font-size: 12px; padding: 7px 12px; border-radius: 8px; border: 1px solid var(--border-soft); background: var(--bg-card); color: var(--text-soft); cursor: pointer; }
        .al-count { font-size: 13.5px; color: var(--text-muted); margin-bottom: 14px; }
        .al-count b { color: var(--text); font-weight: 600; }
        .al-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px; }
        .al-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; transition: box-shadow .25s, transform .25s; }
        .al-card:hover { box-shadow: 0 10px 26px rgba(0,0,0,0.08); transform: translateY(-3px); }
        .al-card-img { position: relative; height: 150px; background: var(--bg-muted); overflow: hidden; cursor: pointer; }
        .al-card-img img { width: 100%; height: 100%; object-fit: cover; }
        .al-badge { position: absolute; top: 10px; left: 10px; font-size: 10.5px; font-weight: 600; padding: 4px 10px; border-radius: 980px; backdrop-filter: blur(6px); color: #fff; }
        .al-cod { position: absolute; top: 10px; right: 10px; background: rgba(255,255,255,0.92); backdrop-filter: blur(6px); color: var(--primary-dark); font-size: 10.5px; font-weight: 700; padding: 4px 9px; border-radius: 980px; }
        .al-card-body { padding: 12px 14px 14px; cursor: pointer; }
        .al-loc { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 3px; }
        .al-title { font-size: 14.5px; font-weight: 600; line-height: 1.3; margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 38px; }
        .al-specs { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; min-height: 18px; }
        .al-specs span { font-size: 12px; color: var(--text-soft); }
        .al-price-tag { }
        .al-price { }
        .al-card-body .al-price { font-size: 16px; font-weight: 700; color: var(--primary-dark); display: block; }
        .al-card-body .al-price small { font-size: 11px; font-weight: 400; color: var(--text-muted); }
        .al-actions { display: flex; gap: 5px; padding: 0 12px 12px; }
        .al-mini { flex: 1; padding: 6px 4px; font-size: 12px; border-radius: 8px; border: 1px solid var(--border-soft); background: var(--bg-muted); color: var(--text); cursor: pointer; transition: all .15s; }
        .al-mini:hover { background: var(--primary-light); border-color: var(--primary-border); }
        .al-ficha { flex: 1.6; font-weight: 600; }
        .al-empty { text-align: center; color: var(--text-muted); padding: 4rem 0; }
      `}</style>

      {showPDF && <PDFModal imoveis={filtered} pdfCampos={pdfCampos} setPdfCampos={setPdfCampos} onClose={() => setShowPDF(false)} />}

      <div className="al-toolbar">
        <h2>Imóveis</h2>
        {filtered.length > 0 && <button className="al-btn-soft" onClick={() => setShowPDF(true)}>📄 Gerar PDF ({filtered.length})</button>}
        <button className="al-btn-soft" onClick={() => navigate("/admin/novo")} style={{ background: "var(--primary)", color: "#fff", border: "none", fontWeight: 600 }}>+ Novo imóvel</button>
      </div>

      {semCodigo > 0 && (
        <div className="al-aviso">
          🏷️ <b>{semCodigo} imóvel(is)</b> sem código. Gere os códigos pelo bairro de uma vez.
          <button onClick={gerarCodigosFaltantes} disabled={migrando}>{migrando ? "Gerando..." : "Gerar códigos"}</button>
        </div>
      )}

      <div className="al-filtros">
        <div className="al-filtros-row">
          <div className="al-search">
            🔍 <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por código, título, bairro, proprietário..." />
          </div>
          <select className="al-sel" value={tipo} onChange={e => setTipo(e.target.value)}>
            <option value="Todos">Todos os tipos</option>
            {tipos.map(t => <option key={t.nome} value={t.nome}>{t.nome}</option>)}
          </select>
          <select className="al-sel" value={transacao} onChange={e => setTransacao(e.target.value)}>
            <option value="Todos">Todas as transações</option>
            {TRANSACOES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="al-sel" value={cidade} onChange={e => setCidade(e.target.value)}>
            {cidades.map(c => <option key={c} value={c}>{c === "Todas" ? "Todas as cidades" : c}</option>)}
          </select>
          <select className="al-sel" value={bairro} onChange={e => setBairro(e.target.value)}>
            {bairros.map(b => <option key={b} value={b}>{b === "Todos" ? "Todos os bairros" : b}</option>)}
          </select>
          <select className="al-sel" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="Todos">Todos os status</option>
            {STATUS_IMOVEL.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="al-sel" value={ordem} onChange={e => setOrdem(e.target.value)}>
            {ORDENACOES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          <button type="button" onClick={() => setSoMinhas(v => !v)} title="Mostrar só os imóveis captados por você"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", border: soMinhas ? "1px solid #C0392B" : "1px solid var(--border)", background: soMinhas ? "#C0392B" : "var(--bg-card)", color: soMinhas ? "#fff" : "inherit" }}>
            👤 Minhas captações{soMinhas ? " ✓" : ""}
          </button>
          <div className="al-price">
            <span>💰</span>
            <input type="text" inputMode="numeric" placeholder="R$ mín" value={precoMin} onChange={e => setPrecoMin(e.target.value.replace(/[^\d]/g, ""))} />
            <span>até</span>
            <input type="text" inputMode="numeric" placeholder="R$ máx" value={precoMax} onChange={e => setPrecoMax(e.target.value.replace(/[^\d]/g, ""))} />
            {(precoMin || precoMax) && <button className="al-clearprice" onClick={() => { setPrecoMin(""); setPrecoMax(""); }}>limpar</button>}
          </div>
        </div>
      </div>

      <div className="al-count"><b>{filtered.length}</b> {filtered.length === 1 ? "imóvel encontrado" : "imóveis encontrados"}</div>

      {loading && <div className="al-empty">Carregando...</div>}
      {!loading && filtered.length === 0 && (
        <div className="al-empty">{imoveis.length === 0 ? "Nenhum imóvel cadastrado ainda." : "Nenhum imóvel encontrado."}</div>
      )}

      <div className="al-grid">
        {filtered.map(im => cardDe(im))}
      </div>
    </div>
  );
}

function PDFModal({ imoveis, pdfCampos, setPdfCampos, onClose }) {
  const todos = pdfCampos.length === PDF_CAMPOS.length;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
      <div style={{ background: "var(--bg-card)", color: "var(--text)", borderRadius: 12, padding: "1.5rem", width: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.2)", maxHeight: "80vh", overflowY: "auto" }}>
        <h3 style={{ margin: "0 0 1rem", fontSize: 17, color: "var(--primary-dark)" }}>Escolha os campos do PDF</h3>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginBottom: 12, fontWeight: 500, color: "var(--primary)" }}>
          <input type="checkbox" checked={todos} onChange={() => setPdfCampos(todos ? [] : PDF_CAMPOS.map(c => c.key))} style={{ width: 15, height: 15, accentColor: "var(--primary)" }} />
          Selecionar todos
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: "1rem" }}>
          {PDF_CAMPOS.map(c => (
            <label key={c.key} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={pdfCampos.includes(c.key)} onChange={() => setPdfCampos(p => p.includes(c.key) ? p.filter(x => x !== c.key) : [...p, c.key])} style={{ width: 15, height: 15, accentColor: "var(--primary)" }} />
              {c.label}
            </label>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer" }}>Cancelar</button>
          <button onClick={() => { onClose(); gerarPDF(imoveis, pdfCampos); }}
            style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontWeight: 500 }}>Gerar PDF</button>
        </div>
      </div>
    </div>
  );
}
