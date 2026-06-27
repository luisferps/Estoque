import { formatBRL, isLocacao, isVenda, statusDoImovel } from "./utils";

// Miniatura otimizada para o card (a foto tem só ~190px de altura).
function thumbUrl(url) {
  if (!url || typeof url !== "string") return url;
  if (url.includes("res.cloudinary.com") && url.includes("/upload/")) {
    return url.replace("/upload/", "/upload/w_640,h_480,c_fill,f_auto,q_auto/");
  }
  return url;
}

const STATUS_COLOR = {
  "Disponível": { bg: "#d4edda", color: "#155724", border: "#c3e6cb" },
  "Reservado":  { bg: "#fff3cd", color: "#856404", border: "#ffeaa7" },
  "Vendido":    { bg: "#f8d7da", color: "#721c24", border: "#f5c6cb" },
  "Alugado":    { bg: "#d1ecf1", color: "#0c5460", border: "#bee5eb" },
  "Aguardando finalização": { bg: "#cffafe", color: "#155e75", border: "#a5f3fc" },
};

function metragem(im) {
  const c = parseFloat(im.metragem);
  if (c) return `${c.toLocaleString("pt-BR")} m²`;
  const t = parseFloat(im.metragemTotal);
  if (t) return `${t.toLocaleString("pt-BR")} m²`;
  return "";
}

export default function ImovelCard({ im, onClick, actions, showStatus = true }) {
  const status = statusDoImovel(im);
  const corSt = STATUS_COLOR[status] || STATUS_COLOR["Disponível"];
  const codigo = (im.codigo == null ? "" : String(im.codigo)).trim().toUpperCase();
  const local = [im.bairro, im.cidade].filter(Boolean).join(", ").toUpperCase();
  const tituloRaw = String(im.titulo == null ? "" : im.titulo).trim();
  const bairroRaw = String(im.bairro == null ? "" : im.bairro).trim();
  const fallbackTipoBairro = im.tipo ? (bairroRaw ? `${im.tipo} em ${bairroRaw}` : im.tipo) : "Imóvel";
  const tituloCard = tituloRaw || fallbackTipoBairro;
  const m2 = metragem(im);
  const q = parseInt(im.quartos) || 0;
  const su = parseInt(im.suites) || 0;
  const va = parseInt(im.garagens) || 0;

  return (
    <div onClick={onClick} className="imovel-card"
      style={{
        background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: 18, overflow: "hidden",
        boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
        color: "var(--text)", display: "flex", flexDirection: "column",
        cursor: "pointer", transition: "transform .18s ease, box-shadow .18s ease"
      }}>
      <div style={{
        position: "relative", height: 190, background: "var(--bg-muted)",
        display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden"
      }}>
        {im.fotos?.[0]
          ? <img src={thumbUrl(im.fotos[0])} alt="" loading="lazy" decoding="async"
              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontSize: 52, opacity: 0.5 }}>🏠</span>}

        {/* Status (se for diferente de Disponível) */
        {showStatus && status !== "Disponível" && (
          <span style={{
            position: "absolute", top: 10, right: 10,
            background: corSt.bg, color: corSt.color, border: `1px solid ${corSt.border}`,
            fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999,
          }}>{status}</span>
        )}
      </div>

      <div style={{ padding: "14px 16px 12px", flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Tipo flutuando no canto direito */}
        {im.tipo && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--primary-dark)", background: "var(--primary-light)", padding: "3px 9px", borderRadius: 999 }}>{im.tipo}</span>
          </div>
        )}
        {/* Código (linha de cima) */}
        {codigo && (
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--primary)", letterSpacing: 0.3, marginBottom: 2 }}>
            CÓD: {codigo}
          </div>
        )}
        {/* Local (linha de baixo) */}
        {local && (
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-soft)", letterSpacing: 0.3, marginBottom: 6 }}>
            {local}
          </div>
        )}

        {/* Título grande */}
        <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 17, color: "var(--text)", lineHeight: 1.25 }}>{tituloCard}</p>

        {/* Metragem */}
        {m2 && <p style={{ margin: "0 0 8px", fontSize: 13.5, color: "var(--text-soft)" }}>{m2}</p>}

        {/* Preço (altura mínima fixa pra alinhar cards sem preço) */}
        <div style={{ minHeight: 28, marginBottom: 8, display: "flex", alignItems: "flex-end" }}>
          {isVenda(im) && im.preco && (
            <span style={{ fontWeight: 800, fontSize: 18, color: "var(--primary)" }}>
              {formatBRL(im.preco)}
            </span>
          )}
          {isLocacao(im) && im.valorFinal && (
            <span style={{ fontWeight: 800, fontSize: 17, color: "#c0762b" }}>
              {formatBRL(im.valorFinal)}<span style={{ fontSize: 11.5, fontWeight: 500 }}>/mês</span>
            </span>
          )}
        </div>

        {/* Linha de atributos (sempre presente — vazia se não tiver dado — pra alinhar cards) */}
        <div style={{ display: "flex", gap: 18, paddingTop: 10, marginTop: "auto", borderTop: "1px solid var(--border)", fontSize: 14, color: "var(--text-soft)", minHeight: 40, alignItems: "center", flexWrap: "wrap" }}>
          {(q > 0) && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{q} <span title="quartos" style={{ fontSize: 18 }}>🛏️</span></span>}
          {(su > 0) && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{su} <span title="suítes" style={{ fontSize: 18 }}>🚿</span></span>}
          {(va > 0) && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{va} <span title="vagas" style={{ fontSize: 18 }}>🚗</span></span>}
          {!(q || su || va) && im.asfalto && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13.5 }}><span style={dotIcon}>≡</span>Asfalto</span>}
          {!(q || su || va) && im.agua && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13.5 }}><span style={dotIcon}>💧</span>Água</span>}
          {!(q || su || va) && im.esgoto && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13.5 }}><span style={dotIcon}>◎</span>Esgoto</span>}
          {!(q || su || va) && !(im.asfalto || im.agua || im.esgoto) && <span style={{ opacity: 0 }}>—</span>}
        </div>

        {actions && (
          <div onClick={e => e.stopPropagation()} style={{ marginTop: 12, display: "flex", gap: 8 }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

const dotIcon = { fontSize: 18, display: "inline-block", width: 20, textAlign: "center" };
