import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useImoveis } from "../shared/hooks";
import { PDF_CAMPOS } from "../constants";
import { formatBRL, gerarPDF, isLote, isLocacao, isVenda, matchTransacao, ordenarImoveis, statusDoImovel, totalLocacao } from "../shared/utils";
import { btnPrimary, pageWrap } from "../shared/styles";
import Filtros from "../shared/Filtros";

// Mantém os filtros da consulta enquanto a aba estiver aberta, para que ao
// abrir uma ficha e voltar (← Voltar) o usuário caia no mesmo resultado.
const FILTROS_KEY = "consulta_filtros";
function lerFiltros() {
  try {
    const raw = sessionStorage.getItem(FILTROS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
const salvos = lerFiltros() || {};

export default function Consulta() {
  const navigate = useNavigate();
  const { imoveis } = useImoveis();
  const [search, setSearch] = useState(salvos.search || "");
  const [tipo, setTipo] = useState(salvos.tipo || "Todos");
  const [transacao, setTransacao] = useState(salvos.transacao || "Todos");
  const [estado, setEstado] = useState(salvos.estado || "Todos");
  const [cidade, setCidade] = useState(salvos.cidade || "Todas");
  const [status, setStatus] = useState(salvos.status || "Todos");
  const [ordem, setOrdem] = useState(salvos.ordem || "recente");
  const [precoMin, setPrecoMin] = useState(salvos.precoMin || "");
  const [precoMax, setPrecoMax] = useState(salvos.precoMax || "");
  const [showPDF, setShowPDF] = useState(false);
  const [pdfCampos, setPdfCampos] = useState(PDF_CAMPOS.map(c => c.key));

  // Salva os filtros sempre que mudam (sessionStorage = vale só enquanto a aba está aberta).
  useEffect(() => {
    sessionStorage.setItem(FILTROS_KEY, JSON.stringify({ search, tipo, transacao, estado, cidade, status, ordem, precoMin, precoMax }));
  }, [search, tipo, transacao, estado, cidade, status, ordem, precoMin, precoMax]);

  const cidades = useMemo(() => ["Todas", ...Array.from(new Set(imoveis.map(im => im.cidade).filter(Boolean))).sort()], [imoveis]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const min = parseFloat(String(precoMin).replace(/[^\d]/g, "")) || 0;
    const max = parseFloat(String(precoMax).replace(/[^\d]/g, "")) || Infinity;
    // Preço de referência do imóvel: venda usa "preco"; senão usa o aluguel.
    const precoDe = (im) => {
      const v = parseFloat(String(im.preco || "").replace(/[^\d]/g, "")) || 0;
      if (v > 0) return v;
      return parseFloat(String(im.valorAluguel || "").replace(/[^\d]/g, "")) || 0;
    };
    const base = imoveis.filter(im =>
      (!q || (im.titulo || "").toLowerCase().includes(q) || (im.descricao || "").toLowerCase().includes(q) || (im.cidade || "").toLowerCase().includes(q) || (im.bairro || "").toLowerCase().includes(q) || (im.endereco || "").toLowerCase().includes(q) || (im.codigo || "").toLowerCase().includes(q) || (im.nomeProprietario || "").toLowerCase().includes(q))
      && (tipo === "Todos" || im.tipo === tipo)
      && matchTransacao(im, transacao)
      && (estado === "Todos" || im.estadoImovel === estado)
      && (cidade === "Todas" || im.cidade === cidade)
      && (status === "Todos" || statusDoImovel(im) === status)
      && (() => { const p = precoDe(im); return p >= min && p <= max; })()
    );
    return ordenarImoveis(base, ordem);
  }, [imoveis, search, tipo, transacao, estado, cidade, status, ordem, precoMin, precoMax]);

  return (
    <div style={pageWrap(960)}>
      {showPDF && <PDFModal imoveis={filtered} pdfCampos={pdfCampos} setPdfCampos={setPdfCampos} onClose={() => setShowPDF(false)} />}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.2rem" }}>
        <button onClick={() => navigate(-1)} style={backBtn}>← Voltar</button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, flex: 1, color: "var(--primary-dark)" }}>Consulta de Imóveis</h2>
        {filtered.length > 0 && <button onClick={() => setShowPDF(true)} style={btnPrimary}>Gerar PDF ({filtered.length})</button>}
      </div>

      <Filtros
        search={search} setSearch={setSearch}
        tipo={tipo} setTipo={setTipo}
        transacao={transacao} setTransacao={setTransacao}
        estado={estado} setEstado={setEstado}
        cidade={cidade} setCidade={setCidade}
        status={status} setStatus={setStatus}
        ordem={ordem} setOrdem={setOrdem}
        cidades={cidades}
        showStatus={true}
      />

      {/* Faixa de preço (venda ou aluguel) */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "0 0 1rem" }}>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>💰 Preço de</span>
        <input
          type="text" inputMode="numeric" placeholder="mínimo"
          value={precoMin}
          onChange={e => setPrecoMin(e.target.value.replace(/[^\d]/g, ""))}
          style={{ width: 130, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text)", fontSize: 14 }}
        />
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>até</span>
        <input
          type="text" inputMode="numeric" placeholder="máximo"
          value={precoMax}
          onChange={e => setPrecoMax(e.target.value.replace(/[^\d]/g, ""))}
          style={{ width: 130, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text)", fontSize: 14 }}
        />
        {(precoMin || precoMax) && (
          <button onClick={() => { setPrecoMin(""); setPrecoMax(""); }} style={{ fontSize: 12, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer" }}>limpar preço</button>
        )}
      </div>

      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 1rem" }}>{filtered.length} imóvel(is) encontrado(s)</p>

      {filtered.length === 0
        ? <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "3rem 0" }}>Nenhum imóvel encontrado.</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map(im => (
              <Linha key={im.id} im={im} onClick={() => navigate(`/admin/imovel/${im.id}`)} />
            ))}
          </div>}
    </div>
  );
}

function Linha({ im, onClick }) {
  const total = totalLocacao(im);
  const lot = isLote(im);
  const loc = isLocacao(im);
  const ven = isVenda(im);
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow)", display: "flex" }}>
      {/* Foto da capa */}
      <div style={{ flexShrink: 0, width: 110, background: "var(--bg-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {im.fotos?.[0]
          ? <img src={im.fotos[0]} alt="" style={{ width: 110, height: "100%", minHeight: 90, objectFit: "cover" }} />
          : <span style={{ fontSize: 28 }}>🏠</span>}
      </div>
      <div style={{ flex: 1, padding: "0.8rem 1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
            {im.tipo && <span style={tag("primary")}>{im.tipo}</span>}
            {im.transacao && <span style={tag()}>{im.transacao}</span>}
            {im.estadoImovel && <span style={tag()}>{im.estadoImovel}</span>}
            <span style={tag()}>{statusDoImovel(im)}</span>
          </div>
          <p style={{ margin: "0 0 4px", fontWeight: 500, fontSize: 16, color: "var(--text)" }}>{im.titulo}</p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>{[im.bairro, im.cidade].filter(Boolean).join(", ")}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          {ven && im.preco && <p style={{ margin: 0, fontWeight: 500, fontSize: 16, color: "var(--primary)" }}>Venda: {formatBRL(im.preco)}</p>}
          {loc && <>
            {parseFloat(im.valorAluguel) > 0 && <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>Aluguel: {formatBRL(im.valorAluguel)}</p>}
            {parseFloat(im.valorCondominio) > 0 && <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>Cond.: {formatBRL(im.valorCondominio)}</p>}
            {parseFloat(im.valorIPTU) > 0 && <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>IPTU: {formatBRL(im.valorIPTU)}</p>}
            {total > 0 && <p style={{ margin: "4px 0 0", fontWeight: 500, fontSize: 15, color: "var(--primary)" }}>Total: {formatBRL(total)}/mês</p>}
          </>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap", fontSize: 13, color: "var(--text-soft)" }}>
        {im.metragem && <span>{im.metragem} m²</span>}
        {im.metragemTotal && <span>{im.metragemTotal} m² terreno</span>}
        {!lot && parseInt(im.quartos) > 0 && <span>{im.quartos} qtos</span>}
        {!lot && parseInt(im.suites) > 0 && <span>{im.suites} suítes</span>}
        {!lot && parseInt(im.garagens) > 0 && <span>{im.garagens} gar.</span>}
        {lot && im.asfalto && <span>✓ Asfalto</span>}
        {lot && im.agua && <span>✓ Água</span>}
        {lot && im.esgoto && <span>✓ Esgoto</span>}
        {lot && im.muro && <span>✓ Muro</span>}
        {lot && (im.retangular && im.frente && im.laterais ? <span>{im.frente}x{im.laterais}m</span> : im.medidas ? <span>{im.medidas}</span> : null)}
        {im.mapsLink && <a href={im.mapsLink} target="_blank" rel="noreferrer" style={{ color: "var(--primary)", textDecoration: "none" }}>Ver mapa</a>}
      </div>
      <button onClick={onClick} style={{ marginTop: 10, fontSize: 12, padding: "5px 14px", borderRadius: 7, border: "1px solid var(--border-soft)", background: "var(--bg-muted)", color: "var(--text)", cursor: "pointer" }}>Ver ficha completa</button>
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

const tag = (variant) => ({
  fontSize: 11,
  background: variant === "primary" ? "var(--primary-light)" : "var(--bg-muted)",
  color: variant === "primary" ? "var(--primary-dark)" : "var(--text-soft)",
  borderRadius: 6, padding: "2px 8px"
});
const backBtn = { display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", fontSize: 15, cursor: "pointer", color: "var(--primary)", fontWeight: 500, padding: 0 };
