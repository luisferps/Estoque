import { TIPOS, TRANSACOES, ESTADOS_IMOVEL, STATUS_IMOVEL, ORDENACOES } from "../constants";

export default function Filtros({
  search, setSearch,
  tipo, setTipo,
  transacao, setTransacao,
  estado, setEstado,
  cidade, setCidade,
  status, setStatus,
  ordem, setOrdem,
  cidades = [],
  showEstado = true,
  showStatus = false,
  showOrdem = true,
}) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap" }}>
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Buscar..."
        style={inputStyle}
      />
      <select value={tipo} onChange={e => setTipo(e.target.value)} style={selectStyle}>
        <option value="Todos">Todos os tipos</option>
        {TIPOS.map(t => <option key={t}>{t}</option>)}
      </select>
      <select value={transacao} onChange={e => setTransacao(e.target.value)} style={selectStyle}>
        <option value="Todos">Todas as transações</option>
        {TRANSACOES.map(t => <option key={t}>{t}</option>)}
      </select>
      {showEstado && (
        <select value={estado} onChange={e => setEstado(e.target.value)} style={selectStyle}>
          <option value="Todos">Novo e Usado</option>
          {ESTADOS_IMOVEL.map(t => <option key={t}>{t}</option>)}
        </select>
      )}
      {showStatus && (
        <select value={status} onChange={e => setStatus(e.target.value)} style={selectStyle}>
          <option value="Todos">Todos status</option>
          {STATUS_IMOVEL.map(s => <option key={s}>{s}</option>)}
        </select>
      )}
      <select value={cidade} onChange={e => setCidade(e.target.value)} style={selectStyle}>
        {cidades.map(c => <option key={c}>{c}</option>)}
      </select>
      {showOrdem && (
        <select value={ordem} onChange={e => setOrdem(e.target.value)} style={selectStyle}>
          {ORDENACOES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      )}
    </div>
  );
}

const inputStyle = {
  flex: 1, minWidth: 180,
  padding: "9px 14px", borderRadius: 10,
  border: "1px solid var(--border-soft)", fontSize: 14,
  background: "var(--bg-input)", color: "var(--text)"
};

const selectStyle = {
  padding: "9px 12px", borderRadius: 10,
  border: "1px solid var(--border-soft)", fontSize: 14,
  background: "var(--bg-input)", color: "var(--text)"
};
