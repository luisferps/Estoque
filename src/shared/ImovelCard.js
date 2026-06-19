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
  const ehLancamento = im.estadoImovel === "Imóvel Novo";
  const codigo = im.codigo ? String(im.codigo).toUpperCase() : "";
  const local = [im.bairro, im.cidade].filter(Boolean).join(", ").toUpperCase();
  const tituloCard = (im.nomeCondominio && String(im.nomeCondominio).trim()) || im.titulo || im.tipo || "Imóvel";
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

        {/* Badge "Lançamento" para imóvel novo */}
        {ehLancamento && (
          <span style={{
            position: "absolute", top: 10, left: 10,
            background: "rgba(20,20,20,0.78)", color: "#fff",
            fontSize: 11.5, fontWeight: 700, letterSpacing: 0.2,
            padding: "5px 12px", borderRadius: 999,
            backdropFilter: "blur(6px)"
          }}>Lançamento</span>
        )}

        {/* Status (se for diferente de Disponível) */}
        {showStatus && status !== "Disponível" && (
          <span style={{
            position: "absolute", top: 10, right: 10,
            background: corSt.bg, color: corSt.color, border: `1px solid ${corSt.border}`,
            fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999,
          }}>{status}</span>
        )}
      </div>

      <div style={{ padding: "14px 16px 12px", flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Código + bairro + tipo */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
          {codigo && <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--primary)", letterSpacing: 0.3 }}>{codigo}</span>}
          {codigo && local && <span style={{ color: "var(--text-muted)", fontSize: 11 }}>·</span>}
          {local && <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-soft)", letterSpacing: 0.3 }}>{local}</span>}
          {im.tipo && (
            <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "var(--primary-dark)", background: "var(--primary-light)", padding: "3px 9px", borderRadius: 999 }}>{im.tipo}</span>
          )}
        </div>

        {/* Título grande */}
        <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 17, color: "var(--text)", lineHeight: 1.25 }}>{tituloCard}</p>

        {/* Metragem */}
        {m2 && <p style={{ margin: "0 0 8px", fontSize: 13.5, color: "var(--text-soft)" }}>{m2}</p>}

        {/* Preço */}
        {isVenda(im) && im.preco && (
          <p style={{ margin: "2px 0 8px", fontWeight: 800, fontSize: 18, color: "var(--primary)" }}>
            {formatBRL(im.preco)}
          </p>
        )}
        {isLocacao(im) && im.valorFinal && (
          <p style={{ margin: "2px 0 8px", fontWeight: 800, fontSize: 17, color: "#c0762b" }}>
            {formatBRL(im.valorFinal)}<span style={{ fontSize: 11.5, fontWeight: 500 }}>/mês</span>
          </p>
        )}

        {/* Linha de atributos: quartos/suites/garagens OU asfalto/água/luz pra lote */}
        {(q || su || va) ? (
          <div style={{ display: "flex", gap: 18, paddingTop: 10, marginTop: "auto", borderTop: "1px solid var(--border)", fontSize: 13, color: "var(--text-soft)" }}>
            {q > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{q} <span title="quartos">🛏️</span></span>}
            {su > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{su} <span title="suítes">🚿</span></span>}
            {va > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{va} <span title="vagas">🚗</span></span>}
          </div>
        ) : (im.asfalto || im.agua || im.esgoto) ? (
          <div style={{ display: "flex", gap: 14, paddingTop: 10, marginTop: "auto", borderTop: "1px solid var(--border)", fontSize: 12.5, color: "var(--text-soft)" }}>
            {im.asfalto && <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={dotIcon}>≡</span>Asfalto</span>}
            {im.agua && <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={dotIcon}>💧</span>Água</span>}
            {im.esgoto && <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={dotIcon}>◎</span>Esgoto</span>}
          </div>
        ) : null}

        {actions && (
          <div onClick={e => e.stopPropagation()} style={{ marginTop: 12, display: "flex", gap: 8 }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

const dotIcon = { fontSize: 13, display: "inline-block", width: 16, textAlign: "center" };
