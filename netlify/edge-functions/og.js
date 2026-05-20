// Edge function que adiciona meta tags Open Graph nas páginas de imóvel.
// Roda só pra crawlers (WhatsApp, Facebook, Twitter, etc) — usuários humanos
// recebem o HTML normal sem overhead.

const FIREBASE_PROJECT = "estoque-53f1e";

// Lista de crawlers conhecidos
const CRAWLER_REGEX = /(WhatsApp|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|SkypeUriPreview|Googlebot|Bingbot|Yandex|Baiduspider|DuckDuckBot|Pinterest)/i;

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatBRL(v) {
  const n = parseFloat(v);
  if (!n) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default async (request, context) => {
  const userAgent = request.headers.get("user-agent") || "";
  const url = new URL(request.url);

  // Se não for crawler, serve o HTML normal sem mexer
  if (!CRAWLER_REGEX.test(userAgent)) {
    return;
  }

  // Pega o id do imóvel da URL
  const match = url.pathname.match(/^\/imovel\/([^/]+)/);
  if (!match) return;
  const id = match[1];

  try {
    // Busca o imóvel no Firestore via REST API (sem precisar de SDK)
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
    // Se o imóvel não está disponível, não renderiza preview
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

    // Monta descrição curta
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

    // Pega o HTML original
    const response = await context.next();
    const html = await response.text();

    // Monta as meta tags
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

    // Injeta as meta tags no <head> e remove o título e meta-description originais
    const novoHtml = html
      .replace(/<title>[\s\S]*?<\/title>/i, "")
      .replace(/<meta\s+name="description"[^>]*>/i, "")
      .replace(/<\/head>/i, `${metaTags}\n</head>`);

    return new Response(novoHtml, {
      status: response.status,
      headers: response.headers,
    });
  } catch (err) {
    // Em caso de erro, serve o HTML normal sem quebrar
    return;
  }
};

export const config = {
  path: "/imovel/*",
};
