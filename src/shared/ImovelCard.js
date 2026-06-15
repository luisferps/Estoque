import { formatBRL, isLocacao, isVenda, statusDoImovel } from "./utils";
const STATUS_COLOR = {
  "Disponível": { bg: "#d4edda", color: "#155724", border: "#c3e6cb" },
  "Reservado":  { bg: "#fff3cd", color: "#856404", border: "#ffeaa7" },
  "Vendido":    { bg: "#f8d7da", color: "#721c24", border: "#f5c6cb" },
  "Alugado":    { bg: "#d1ecf1", color: "#0c5460", border: "#bee5eb" },
  "Aguardando finalização": { bg: "#cffafe", color: "#155e75", border: "#a5f3fc" },
};
// Metragem para exibição: usa construção; se não houver (ex: lote), usa a do terreno.
function metragemImovel(im) {
  const c = parseFloat(im.metragem);
  if (c) return { valor: c, label: "m²" };
  const t = parseFloat(im.metragemTotal);
  if (t) return { valor: t, label: "m² (terreno)" };
  return null;
}
export default function ImovelCard({ im, onClick, actions, showStatus = true }) {
  const status = statusDoImovel(im);
  const cor = STATUS_COLOR[status] || STATUS_COLOR["Disponível"];
  const met = metragemImovel(im);
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border)",
      borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow)",
      color: "var(--text)", display: "flex", flexDirection: "column"
    }}>
      <div onClick={onClick}
        style={{
          height: 160, background: "var(--bg-muted)",
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden", cursor: "pointer", position: "relative"
        }}>
        {im.fotos?.[0]
          ? <img src={im.fotos[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontSize: 52 }}>🏠</span>}
        {showStatus && status !== "Disponível" && (
          <span style={{
            position: "absolute", top: 8, left: 8,
            background: cor.bg, color: cor.color, border: `1px solid ${cor.border}`,
            fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 12,
          }}>{status}</span>
        )}
      </div>
      <div style={{ padding: "12px 14px", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
          {im.tipo && <span style={tag("primary")}>{im.tipo}</span>}
          {im.transacao && <span style={tag()}>{im.transacao}</span>}
          {im.estadoImovel && <span style={tag()}>{im.estadoImovel}</span>}
        </div>
        {im.titulo && <p style={{ margin: "0 0 2px", fontWeight: 500, fontSize: 15, color: "var(--text)" }}>{im.titulo}</p>}
        {(im.bairro || im.cidade) && (
          <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--text-muted)" }}>
            {[im.bairro, im.cidade].filter(Boolean).join(", ")}
          </p>
        )}
        {met && (
          <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--text-muted)" }}>
            📏 {met.valor} {met.label}
          </p>
        )}
        {isVenda(im) && im.preco && (
          <p style={{ margin: "0 0 2px", fontWeight: 500, fontSize: 15, color: "var(--primary)" }}>
            {formatBRL(im.preco)}
          </p>
        )}
        {isLocacao(im) && im.valorFinal && (
          <p style={{ margin: "0 0 8px", fontWeight: 500, fontSize: 14, color: "#c0762b" }}>
            {formatBRL(im.valorFinal)}<span style={{ fontSize: 11, fontWeight: 400 }}>/mês</span>
          </p>
        )}
        {actions && <div style={{ marginTop: "auto", paddingTop: 6, display: "flex", gap: 6 }}>{actions}</div>}
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
