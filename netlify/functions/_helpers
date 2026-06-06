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
function toInt(val) {
  if (val === null || val === undefined || val === "") return 0;
  const num = parseFloat(
    String(val).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")
  );
  return isNaN(num) ? 0 : Math.round(num);
}

// Converte valor para float (mantém casas decimais).
function toFloat(val) {
  if (val === null || val === undefined || val === "") return 0;
  const num = parseFloat(
    String(val).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")
  );
  return isNaN(num) ? 0 : num;
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

module.exports = {
  xmlEscape,
  cdata,
  normalizeImageUrl,
  toInt,
  toFloat,
  isDisponivel,
  temFlagAnuncio,
  urlPublica,
};
