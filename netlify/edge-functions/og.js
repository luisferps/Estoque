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

  // Pega o id do imóvel da URL (cobre /imovel/:id e /fotos/:id)
  const match = url.pathname.match(/^\/(?:imovel|fotos)\/([^/]+)/);
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

    // ── JSON-LD schema.org (RealEstateListing): dá pro Google preço, quartos, área e local ──
    const quartos = getNum("quartos");
    const suites = getNum("suites");
    const garagens = getNum("garagens");
    const metragem = getNum("metragem");
    const metragemTotal = getNum("metragemTotal");
    const valorAluguel = getNum("valorAluguel");
    const estado = getStr("estado");
    const descricaoFull = getStr("descricao");
    const createdAt = getNum("createdAt");

    const t = (tipo || "").toLowerCase();
    const ven = /venda/i.test(transacao);
    const loc = /loca/i.test(transacao);
    const lote = /(lote|terreno|área|area)/.test(t);
    const tipoSchema = /apart/.test(t) ? "Apartment"
      : /(casa|sobrad)/.test(t) ? "House"
      : lote ? "Place" : "Residence";

    const ld = {
      "@context": "https://schema.org",
      "@type": "RealEstateListing",
      name: titulo,
      url: urlAtual,
    };
    const descLd = (descricaoFull || descricao).replace(/\s+/g, " ").trim().slice(0, 5000);
    if (descLd) ld.description = descLd;
    if (fotos.length) ld.image = fotos.slice(0, 12);
    if (createdAt > 0) { try { ld.datePosted = new Date(createdAt).toISOString().slice(0, 10); } catch (e) {} }

    const about = { "@type": tipoSchema };
    if (!lote) {
      if (quartos > 0) about.numberOfBedrooms = quartos;
      if (suites > 0) about.numberOfBathroomsTotal = suites;
    }
    const area = metragem > 0 ? metragem : metragemTotal;
    if (area > 0) about.floorSize = { "@type": "QuantitativeValue", value: area, unitCode: "MTK" };
    const addr = { "@type": "PostalAddress", addressCountry: "BR" };
    if (bairro) addr.streetAddress = bairro;
    if (cidade) addr.addressLocality = cidade;
    if (estado) addr.addressRegion = estado;
    if (bairro || cidade || estado) about.address = addr;
    ld.about = about;

    const precoOferta = ven ? preco : (valorAluguel || valorFinal);
    if (precoOferta > 0) {
      const offer = {
        "@type": "Offer",
        price: precoOferta,
        priceCurrency: "BRL",
        availability: "https://schema.org/InStock",
        businessFunction: ven ? "http://purl.org/goodrelations/v1#Sell" : "http://purl.org/goodrelations/v1#LeaseOut",
      };
      if (loc) offer.priceSpecification = { "@type": "UnitPriceSpecification", price: precoOferta, priceCurrency: "BRL", unitCode: "MON" };
      ld.offers = offer;
    }

    // escapa < > & pra nunca quebrar o <script> nem o HTML
    const jsonLd = `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")}</script>`;

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

    // Injeta as meta tags no <head> e remove as antigas (título, og:*, twitter:*)
    const novoHtml = html
      .replace(/<title>[\s\S]*?<\/title>/i, "")
      .replace(/<meta\s+name="description"[^>]*>/gi, "")
      .replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, "")
      .replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, "")
      .replace(/<\/head>/i, `${metaTags}\n${jsonLd}\n</head>`);

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
  path: ["/imovel/*", "/fotos/*"],
};
