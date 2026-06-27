import { useState } from "react";
import { formatBRL } from "../shared/utils";

// Painel de PRÉVIA + QUALIDADE do anúncio (antes de salvar).
// O checklist espelha exatamente o que Canal Pro e Chaves na Mão pontuam.
export default function PreviaQualidade({ form, isLote }) {
  const [aberto, setAberto] = useState(true);

  const trans = form.transacao || "";
  const isVenda = trans === "Venda" || trans === "Venda e Locação";
  const isLocacao = trans === "Locação" || trans === "Venda e Locação";

  const nFotos = (form.fotos || []).filter(Boolean).length;
  const descLen = (form.descricao || "").trim().length;
  const temArea = !!(parseFloat(form.metragem) || parseFloat(form.metragemTotal));
  const temPreco = isVenda ? !!parseFloat(form.preco) : !!parseFloat(form.valorAluguel);
  const temCaracteristicas =
    !!(form.extras || "").trim() || form.asfalto || form.esquina || form.muro || form.condominio;
  const emCondominio = !!form.condominio;
  const temCondominio = !!(parseFloat(form.valorCondominio) || parseFloat(form.valorCondominioMensal));

  // status: "ok" | "aviso" | "erro"
  const checks = [];
  const add = (label, status, dica) => checks.push({ label, status, dica });

  // Fotos
  if (nFotos === 0) add("Fotos", "erro", "Adicione pelo menos 3 fotos");
  else if (nFotos < 5) add("Fotos", "aviso", `${nFotos} foto(s) — adicione mais (ideal 5+)`);
  else add("Fotos", "ok", `${nFotos} fotos`);

  // Descrição
  if (descLen < 50) add("Descrição", "erro", "Muito curta — escreva pelo menos 50 caracteres");
  else if (descLen < 500) add("Descrição", "aviso", `${descLen} caracteres — ideal 500+ (Chaves pontua)`);
  else add("Descrição", "ok", `${descLen} caracteres`);

  // Valor
  add("Valor", temPreco ? "ok" : "erro", temPreco ? null : (isVenda ? "Informe o preço de venda" : "Informe o valor do aluguel"));

  // Área
  add("Metragem", temArea ? "ok" : "aviso", temArea ? null : "Informe a metragem");

  if (!isLote) {
    add("Quartos", parseFloat(form.quartos) ? "ok" : "aviso", parseFloat(form.quartos) ? null : "Informe a quantidade de quartos");
    add("Banheiros", parseFloat(form.banheiros) ? "ok" : "aviso", parseFloat(form.banheiros) ? null : "Informe a quantidade de banheiros");
    add("Vagas", parseFloat(form.garagens) ? "ok" : "aviso", parseFloat(form.garagens) ? null : "Informe as vagas de garagem");
  }

  // IPTU — só cobra em locação (em venda é opcional)
  if (isLocacao) {
    add("IPTU", parseFloat(form.valorIPTU) ? "ok" : "aviso", parseFloat(form.valorIPTU) ? null : "Informe o valor do IPTU");
  }

  // Condomínio (só cobra se for em condomínio)
  if (emCondominio) add("Condomínio", temCondominio ? "ok" : "aviso", temCondominio ? null : "Informe o valor do condomínio");

  // Características
  add("Características", temCaracteristicas ? "ok" : "aviso", temCaracteristicas ? null : "Adicione comodidades em \"Características extras\"");

  // Endereço completo
  add("Endereço", (form.endereco || "").trim() ? "ok" : "aviso", (form.endereco || "").trim() ? null : "Preencha a rua (endereço completo dá +leads)");

  // Coordenadas
  add("Coordenadas", (form.latitude && form.longitude) ? "ok" : "aviso", (form.latitude && form.longitude) ? null : "Sem coordenadas — serão buscadas ao salvar");

  const oks = checks.filter(c => c.status === "ok").length;
  const nota = checks.length ? Math.round((oks / checks.length) * 100) / 10 : 0;
  const corNota = nota >= 7 ? "#16a34a" : nota >= 5 ? "#d97706" : "#dc2626";
  const pendentes = checks.filter(c => c.status !== "ok");

  const ICONE = { ok: "✓", aviso: "!", erro: "✕" };
  const COR = { ok: "#16a34a", aviso: "#d97706", erro: "#dc2626" };

  const tituloPreview = (form.titulo || "").trim() || `${form.tipo || "Imóvel"}${form.bairro ? " em " + form.bairro : ""}`;
  const precoPreview = isVenda ? parseFloat(form.preco) : parseFloat(form.valorAluguel);

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginTop: 18, background: "var(--bg-card)" }}>
      <button type="button" onClick={() => setAberto(a => !a)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 14px", background: "var(--bg-muted)", border: "none", cursor: "pointer", color: "var(--text)" }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>Prévia e qualidade do anúncio</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: corNota }}>{nota.toFixed(1)}/10</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{aberto ? "▲" : "▼"}</span>
        </span>
      </button>

      {aberto && (
        <div style={{ padding: 14 }}>
          {/* Barra da nota */}
          <div style={{ height: 8, borderRadius: 6, background: "var(--bg-muted)", overflow: "hidden", marginBottom: 14 }}>
            <div style={{ width: `${nota * 10}%`, height: "100%", background: corNota, transition: "width .3s" }} />
          </div>

          {/* Prévia */}
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

          {/* Checklist */}
          {pendentes.length > 0 ? (
            <>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>O que pode melhorar a nota:</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {pendentes.map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13 }}>
                    <span style={{ flex: "0 0 18px", width: 18, height: 18, borderRadius: "50%", background: COR[c.status], color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, marginTop: 1 }}>{ICONE[c.status]}</span>
                    <span style={{ color: "var(--text)" }}><b>{c.label}:</b> {c.dica}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: "#16a34a", fontWeight: 600 }}>✓ Anúncio completo! Nota máxima nos portais.</p>
          )}

          <p style={{ margin: "12px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
            Dica: vídeo e tour virtual também aumentam a nota — adicione o link direto no portal.
          </p>
        </div>
      )}
    </div>
  );
}

const tag = {
  fontSize: 11, padding: "2px 8px", borderRadius: 10,
  background: "var(--bg-muted)", color: "var(--text-muted)",
};
