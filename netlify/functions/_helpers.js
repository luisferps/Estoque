// netlify/functions/_helpers.js
// Helpers compartilhados pelos três feeds XML.

// Escape de caracteres XML especiais para atributos e conteúdo sem CDATA.
function xmlEscape(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Envolve conteúdo em CDATA — usado para títulos, descrições, nomes (qualquer
// campo que possa conter acentos, aspas ou caracteres especiais).
function cdata(str) {
  if (str === null || str === undefined || str === "") return "<![CDATA[]]>";
  // Remove caracteres de controle inválidos em XML
  const clean = String(str).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  // Escapa fechamento de CDATA dentro do conteúdo
  return `<![CDATA[${clean.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

// Normaliza URL do Cloudinary para garantir extensão .jpg e qualidade automática.
// Os portais (especialmente Chaves na Mão e Meta) leem a extensão da URL para
// determinar o formato — URLs sem extensão são rejeitadas ou tratadas mal.
function normalizeImageUrl(url) {
  if (!url) return "";
  let u = String(url).trim();
  if (!u) return "";
  // Injeta transformação Cloudinary: força JPG + qualidade automática
  if (u.includes("/upload/") && !u.includes("/upload/f_") && !u.includes("/upload/q_")) {
    u = u.replace("/upload/", "/upload/f_jpg,q_auto:good/");
  }
  // Remove query string, se houver
  u = u.split("?")[0];
  // Garante extensão .jpg no final
  if (!/\.(jpg|jpeg)$/i.test(u)) {
    u += ".jpg";
  }
  return u;
}

// Converte valor para inteiro, removendo "R$", pontos e vírgulas brasileiras.
// IMPORTANTE: assume formato BR para VALORES MONETÁRIOS (ponto = milhar,
// vírgula = decimal). Ex: "350.000,50" -> 350001. NÃO use para metragem
// (que vem do input HTML com ponto decimal) — use toMetros para isso.
function toInt(val) {
  if (val === null || val === undefined || val === "") return 0;
  const num = parseFloat(
    String(val).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")
  );
  return isNaN(num) ? 0 : Math.round(num);
}

// Converte valor para float (mantém casas decimais). Mesmo formato BR do toInt.
function toFloat(val) {
  if (val === null || val === undefined || val === "") return 0;
  const num = parseFloat(
    String(val).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")
  );
  return isNaN(num) ? 0 : num;
}

// Converte METRAGEM para inteiro arredondado.
// Os campos de metragem vêm do input HTML type="number", que usa PONTO como
// separador decimal (ex: "538.34") e nunca tem separador de milhar (a regra do
// cadastro é digitar só números). Por isso aqui o ponto é tratado como DECIMAL
// (ao contrário de toInt, que o trata como milhar para valores em R$).
// Também aceita vírgula como decimal, por segurança. Arredonda para o inteiro
// mais próximo, que é o que os portais esperam na área.
function toMetros(val) {
  if (val === null || val === undefined || val === "") return 0;
  const limpo = String(val).replace(/[^\d.,-]/g, "").replace(",", ".");
  const num = parseFloat(limpo);
  return isNaN(num) ? 0 : Math.round(num);
}

// Imóvel só é divulgado se status for "Disponível" (ou vazio, como fallback).
// Reservado / Vendido / Alugado são excluídos automaticamente.
function isDisponivel(imovel) {
  const status = (imovel.status || "").toLowerCase().trim();
  return status === "disponível" || status === "disponivel" || status === "";
}

// Verifica se o imóvel tem a flag de anúncio ativa para o canal informado.
function temFlagAnuncio(imovel, canal) {
  const info = imovel.anuncios && imovel.anuncios[canal];
  return !!(info && info.ativo);
}

// URL pública do imóvel no site (usada como deep-link nos feeds).
function urlPublica(imovel, baseUrl) {
  return `${baseUrl.replace(/\/$/, "")}/imovel/${imovel.id}`;
}

// ─── Cadastro central de tipos (fonte única, gerenciado no painel WA) ───
// Os feeds buscam a lista central pra resolver o "comportamento" de cada tipo
// (terreno / construcao / simples) e o código VRSync. Assim, tipos novos
// nunca são excluídos silenciosamente — caem num genérico por comportamento.
const TIPOS_CENTRAL_ENDPOINT =
  "https://agentes-de-whatsapp-production.up.railway.app/scheduler/tipos-imovel";

async function carregarTiposCentral() {
  try {
    const r = await fetch(TIPOS_CENTRAL_ENDPOINT);
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data && data.tipos) ? data.tipos : [];
  } catch (e) {
    console.log("[feeds] Falha ao carregar tipos central:", e.message);
    return [];
  }
}

// Acha o tipo central correspondente ao nome (ou id) gravado no imóvel.
function acharTipoCentral(tiposCentral, nomeOuId) {
  const n = String(nomeOuId || "").trim().toLowerCase();
  if (!n) return null;
  return (tiposCentral || []).find(
    (t) =>
      String(t.nome || "").trim().toLowerCase() === n ||
      String(t.id || "").trim().toLowerCase() === n
  ) || null;
}

module.exports = {
  xmlEscape,
  cdata,
  normalizeImageUrl,
  toInt,
  toFloat,
  toMetros,
  isDisponivel,
  temFlagAnuncio,
  urlPublica,
  carregarTiposCentral,
  acharTipoCentral,
};
