import { useState } from "react";
import { formatBRL } from "../shared/utils";

// Painel de PRÉVIA + checagem de publicação nos portais (antes de salvar).
// Foco: mostrar o que VAI REJEITAR o anúncio no Canal Pro / ZAP+ e Chaves na Mão.
// As regras espelham os relatórios de erro reais dos portais.
export default function PreviaQualidade({ form, isLote }) {
  const [aberto, setAberto] = useState(true);

  const trans = form.transacao || "";
  const isVenda = trans === "Venda" || trans === "Venda e Locação";
  const isLocacao = trans === "Locação" || trans === "Venda e Locação";

  const nFotos = (form.fotos || []).filter(Boolean).length;
  const descLen = (form.descricao || "").trim().length;
  const temArea = !!(parseFloat(form.metragem) || parseFloat(form.metragemTotal));
  const temPreco = isVenda ? !!parseFloat(form.preco) : !!parseFloat(form.valorAluguel);
  const cepLimpo = String(form.cep || "").replace(/\D/g, "");

  // BLOQUEIOS = o portal REJEITA o anúncio (não publica). Espelha os relatórios.
  const bloqueios = [];
  if (nFotos === 0) bloqueios.push("Sem fotos — adicione pelo menos 1");
  if (!temPreco) bloqueios.push(isVenda ? "Sem preço de venda" : "Sem valor de aluguel");
  if (!(form.cidade || "").trim()) bloqueios.push("Sem cidade — o portal recusa");
  if (!(form.bairro || "").trim()) bloqueios.push("Sem bairro — o portal recusa");
  if (descLen < 50) bloqueios.push("Descrição curta — mínimo 50 caracteres");

  // AVISOS = publica, mas pode melhorar (não bloqueia). Mantido curto e discreto.
  const avisos = [];
  if (!cepLimpo) avisos.push("CEP vazio — o feed usa o CEP da cidade, mas o ideal é o exato");
  else if (cepLimpo.length !== 8) avisos.push("CEP inválido — precisa ter 8 dígitos");
  if (!isLote && !parseInt(form.quartos)) avisos.push("Sem quartos informados");
  if (!isLote && !parseInt(form.banheiros)) avisos.push("Sem banheiros informados");
  if (nFotos > 0 && nFotos < 5) avisos.push(`${nFotos} foto(s) — ideal 5 ou mais`);
  if (descLen >= 50 && descLen < 500) avisos.push("Descrição pode ser mais completa (500+)");
  if (!temArea) avisos.push("Sem metragem informada");
  if (!(form.latitude && form.longitude)) avisos.push("Sem coordenadas — serão buscadas ao salvar");

  const tituloPreview = (form.titulo || "").trim() || `${form.tipo || "Imóvel"}${form.bairro ? " em " + form.bairro : ""}`;
  const precoPreview = isVenda ? parseFloat(form.preco) : parseFloat(form.valorAluguel);

  const okPublicar = bloqueios.length === 0;
  const corCabecalho = okPublicar ? "#16a34a" : "#dc2626";
  const textoCabecalho = okPublicar ? "✓ Pronto para os portais" : `${bloqueios.length} item(ns) bloqueiam a publicação`;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginTop: 18, background: "var(--bg-card)" }}>
      <button type="button" onClick={() => setAberto(a => !a)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 14px", background: "var(--bg-muted)", border: "none", cursor: "pointer", color: "var(--text)" }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>Prévia do anúncio</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: corCabecalho }}>{textoCabecalho}</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{aberto ? "▲" : "▼"}</span>
        </span>
      </button>

      {aberto && (
        <div style={{ padding: 14 }}>
          {/* Prévia visual */}
          <div style={{ border: "1px solid var(--border-soft)", borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ height: 120, background: "var(--bg-muted)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
              {form.fotos?.[0]
                ? <img src={form.fotos[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontSize: 40 }}>🏠</span>}
              <span style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,.6)", color: "#fff", fontSize: 11, padding: "2px 8px", borderRadius: 10 }}>📷 {nFotos}</span>
            </div>
            <div style={{ padding: "10px 12px" }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                {form.tipo && <span style={tag}>{form.tipo}</span>}
                {form.transacao && <span style={tag}>{form.transacao}</span>}
              </div>
              <p style={{ margin: "2px 0", fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{tituloPreview}</p>
              {(form.bairro || form.cidade) && (
                <p style={{ margin: "2px 0", fontSize: 12, color: "var(--text-muted)" }}>
                  {[form.bairro, form.cidade].filter(Boolean).join(", ")}
                </p>
              )}
              {precoPreview > 0 && (
                <p style={{ margin: "4px 0 0", fontWeight: 700, fontSize: 15, color: "var(--primary)" }}>
                  {formatBRL(precoPreview)}{isLocacao ? "/mês" : ""}
                </p>
              )}
            </div>
          </div>

          {/* Bloqueios — o que IMPEDE a publicação */}
          {bloqueios.length > 0 ? (
            <>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: "#dc2626" }}>Vai ser rejeitado nos portais:</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: avisos.length ? 14 : 0 }}>
                {bloqueios.map((b, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13 }}>
                    <span style={{ flex: "0 0 18px", width: 18, height: 18, borderRadius: "50%", background: "#dc2626", color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, marginTop: 1 }}>✕</span>
                    <span style={{ color: "var(--text)" }}>{b}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p style={{ margin: avisos.length ? "0 0 14px" : 0, fontSize: 13, color: "#16a34a", fontWeight: 600 }}>✓ Sem bloqueios — o anúncio publica nos portais.</p>
          )}

          {/* Avisos — opcionais, discretos */}
          {avisos.length > 0 && (
            <details>
              <summary style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>
                {avisos.length} sugestão(ões) para melhorar (opcional)
              </summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
                {avisos.map((a, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5 }}>
                    <span style={{ flex: "0 0 16px", width: 16, height: 16, borderRadius: "50%", background: "#d97706", color: "#fff", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, marginTop: 1 }}>!</span>
                    <span style={{ color: "var(--text-muted)" }}>{a}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

const tag = {
  fontSize: 11, padding: "2px 8px", borderRadius: 10,
  background: "var(--bg-muted)", color: "var(--text-muted)",
};
