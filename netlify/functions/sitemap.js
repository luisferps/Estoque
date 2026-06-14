// netlify/functions/sitemap.js
// Gera o sitemap.xml dinamicamente, listando a home e todas as páginas de
// imóveis DISPONÍVEIS (lidas do Firebase). Mantém-se sempre atualizado sem
// intervenção manual — imóveis vendidos saem, novos entram.
//
// Exposto como /sitemap.xml via regra no public/_redirects.

const { getDb } = require("./_firebase");
const { isDisponivel, apareceNoSite } = require("./_helpers");

const BASE_URL = "https://imoveisdisponiveis.netlify.app";

// Identificador usado na URL pública (/imovel/:id). Usa o código legível do
// Estoque quando existe (ex: "Rosa dos Ventos"), senão o id do Firebase.
// Mantém o mesmo critério dos feeds para casar com as rotas reais.
function urlId(imovel) {
  const bruto = (imovel.codigo || "").trim() || String(imovel.id || "");
  return encodeURIComponent(bruto);
}

function isoData(imovel) {
  // Usa a data de atualização/criação se houver; senão, hoje.
  const ts = imovel.atualizadoEm || imovel.createdAt || Date.now();
  const d = new Date(typeof ts === "number" ? ts : Date.parse(ts) || Date.now());
  return isNaN(d.getTime()) ? new Date().toISOString().substring(0, 10)
    : d.toISOString().substring(0, 10);
}

exports.handler = async () => {
  try {
    const db = getDb();
    const snap = await db.collection("imoveis").get();

    const urls = [];
    // Home
    urls.push(`  <url>
    <loc>${BASE_URL}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`);

    let total = 0;
    snap.forEach((doc) => {
      const imovel = { id: doc.id, ...doc.data() };
      if (!isDisponivel(imovel)) return;
      if (!apareceNoSite(imovel)) return;
      total++;
      const loc = `${BASE_URL}/imovel/${urlId(imovel)}`;
      urls.push(`  <url>
    <loc>${loc}</loc>
    <lastmod>${isoData(imovel)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;

    console.log(`[sitemap] gerado com ${total} imóveis + home`);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
      body: xml,
    };
  } catch (err) {
    console.error("[sitemap] Erro:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: `Erro ao gerar sitemap:\n${err.message}`,
    };
  }
};
