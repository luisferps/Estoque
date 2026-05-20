const FIREBASE_PROJECT = "estoque-53f1e";
const CRAWLER_REGEX = /(WhatsApp|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|SkypeUriPreview|Googlebot|Bingbot|Yandex|Baiduspider|DuckDuckBot|Pinterest)/i;

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function formatBRL(v) {
  const n = parseFloat(v);
  if (!n) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default async (request, context) => {
  const userAgent = request.headers.get("user-agent") || "";
  const url = new URL(request.url);
  if (!CRAWLER_REGEX.test(userAgent)) return;
  const match = url.pathname.match(/^\/imovel\/([^/]+)/);
  if (!match) return;
  const id = match[1];
  try {
    const fbUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/imoveis/${id}`;
    const fbRes = await fetch(fbUrl);
    if (!fbRes.ok) return;
    const data = await fbRes.json();
    const fields = data.fields || {};
    const getStr = (k) => fields[k]?.stringValue || "";
    const getNum = (k) => {
      const f = fields[k];
      return f ? parseFloat(f.doubleValue || f.integerValue || f.stringValue || 0) : 0;
    };
    const getArr = (k) => fields[k]?.arrayValue?.values?.map(v => v.stringValue) || [];
    const status = getStr("status") || "Disponível";
    if (status !== "Disponível") return;
    const titulo = getStr("titulo") || "Imóvel disponível";
    const cidade = getStr("cidade");
    const bairro = getStr("bairro");
    const tipo = getStr("tipo");
    const transacao = getStr("transacao");
    const fotos = getArr("fotos");
    const preco = getNum("preco");
    const valorFinal = getNum("valorFinal");
    const localizacao = [bairro, cidade].filter(Boolean).join(", ");
    let descricao = "";
    if (tipo) descricao += tipo;
    if (transacao) descricao += ` para ${transacao.toLowerCase()}`;
    if (localizacao) descricao += ` em ${localizacao}`;
    if (transacao === "Locação" && valorFinal) {
      descricao += `. A partir de ${formatBRL(valorFinal)}/mês.`;
    } else if (preco) {
      descricao += `. ${formatBRL(preco)}.`;
    }
    descricao = descricao.trim() || "Imóvel disponível em nosso estoque.";
    const imagem = fotos[0] || "";
    const urlAtual = request.url;
    const response = await context.next();
    const html = await response.text();
    const metaTags = `
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(urlAtual)}" />
    <meta property="og:title" content="${escapeHtml(titulo)}" />
    <meta property="og:description" content="${escapeHtml(descricao)}" />
    ${imagem ? `<meta property="og:image" content="${escapeHtml(imagem)}" />` : ""}
    ${imagem ? `<meta property="og:image:width" content="1200" />` : ""}
    ${imagem ? `<meta property="og:image:height" content="630" />` : ""}
    <meta property="og:site_name" content="Inerente Gestão Imobiliária" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(titulo)}" />
    <meta name="twitter:description" content="${escapeHtml(descricao)}" />
    ${imagem ? `<meta name="twitter:image" content="${escapeHtml(imagem)}" />` : ""}
    <meta name="description" content="${escapeHtml(descricao)}" />
    <title>${escapeHtml(titulo)} — Inerente Gestão Imobiliária</title>`;
    const novoHtml = html
      .replace(/<title>[\s\S]*?<\/title>/i, "")
      .replace(/<meta\s+name="description"[^>]*>/gi, "")
      .replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, "")
      .replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, "")
      .replace(/<\/head>/i, `${metaTags}\n</head>`);
    return new Response(novoHtml, { status: response.status, headers: response.headers });
  } catch (err) {
    return;
  }
};

export const config = { path: "/imovel/*" };
