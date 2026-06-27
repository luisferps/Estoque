// netlify/functions/feed-meta.js
// Feed XML (RSS 2.0) para Catálogo de Imóveis da Meta (Facebook + Instagram).
// Documentação: https://developers.facebook.com/docs/marketing-api/catalog/reference/
//
// Tipo de catálogo: "Setor Imobiliário" (Home Listings).
// Campos obrigatórios: home_listing_id, name, address, latitude, longitude,
// price, image, url, availability.
//
// Atenção: imóveis sem latitude/longitude são EXCLUÍDOS do feed Meta.

const { getDb } = require("./_firebase");
const {
  xmlEscape, cdata, normalizeImageUrl, toInt, toMetros, isDisponivel, apareceNosPortais, temFlagAnuncio,
  carregarTiposCentral, acharTipoCentral,
} = require("./_helpers");

const BASE_URL = "https://inerente.com.br";

// Identificador do anúncio (home_listing_id) — usa o código legível do Estoque
// (ex: "Rosa dos Ventos"), com fallback para o id do Firebase se faltar.
function refImovel(imovel) {
  const bruto = (imovel.codigo || "").trim() || String(imovel.id || "");
  const limpo = bruto
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 \-]/g, "")
    .replace(/\s+/g, " ").trim();
  return limpo || String(imovel.id || "");
}

// Mapeamento tipo → property_type (texto livre aceito pela Meta).
const PROPERTY_TYPE_MAP = {
  "Apartamento": "Apartment",
  "Casa": "House",
  "Sobrado": "House",
  "Casa de Condomínio": "House",
  "Casa em Condomínio": "House",
  "Sobrado em Condomínio": "House",
  "Cobertura": "Penthouse",
  "Flat": "Apartment",
  "Kitnet": "Apartment",
  "Studio": "Apartment",
  "Loft": "Loft",
  "Sítio": "Land",
  "Chácara": "Land",
  "Chácara em Condomínio": "Land",
  "Fazenda": "Land",
  "Área": "Land",
  "Lote": "Land",
  "Lote em Condomínio": "Land",
  "Terreno": "Land",
  "Galpão": "Commercial",
  "Depósito": "Commercial",
  "Sala Comercial": "Commercial",
  "Sala": "Commercial",
  "Loja": "Commercial",
  "Ponto Comercial": "Commercial",
};

// Decide listing_type segundo a transação.
function listingType(t) {
  if (!t) return "for_sale";
  const lower = t.toLowerCase();
  if (lower.includes("locação") || lower.includes("locacao") || lower.includes("aluguel")) {
    return "for_rent";
  }
  return "for_sale";
}

// Default de property_type por comportamento (tipo não mapeado).
function propertyTypePorComportamento(comportamento) {
  if (comportamento === "terreno") return "Land";
  if (comportamento === "simples") return "Commercial";
  return "House"; // construcao ou desconhecido
}

function buildItem(imovel, tiposCentral) {
  const id = String(imovel.id);
  const ref = refImovel(imovel);
  const linkRef = encodeURIComponent(ref);

  // Tipo (sempre resolve — mapa local ou fallback por comportamento, não exclui)
  const central = acharTipoCentral(tiposCentral, imovel.tipo || "");
  let propertyType = PROPERTY_TYPE_MAP[imovel.tipo || ""]
    || propertyTypePorComportamento(central && central.comportamento);
  // Rede de segurança por NOME: evita terreno/comercial cair como "House".
  if (propertyType === "House") {
    const n = (imovel.tipo || "").toLowerCase();
    if (/lote|terreno|gleba|loteamento|sítio|sitio|chácara|chacara|fazenda|[aá]rea/.test(n)) propertyType = "Land";
    else if (/galpão|galpao|depósito|deposito|armazém|armazem|sala|loja|ponto|comercial|hotel|pousada|motel/.test(n)) propertyType = "Commercial";
  }

  // Latitude e longitude OBRIGATÓRIAS na Meta
  const lat = parseFloat(imovel.latitude);
  const lng = parseFloat(imovel.longitude);
  if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
    console.log(`[Meta] Pulado ${id}: sem latitude/longitude`);
    return null;
  }

  // Imagem obrigatória
  const fotos = (imovel.fotos || []).map(normalizeImageUrl).filter(Boolean);
  if (fotos.length === 0) {
    console.log(`[Meta] Pulado ${id}: sem fotos`);
    return null;
  }

  // Endereço obrigatório
  const uf = (imovel.estado || "").substring(0, 2).toUpperCase();
  const cidade = imovel.cidade || "";
  const bairro = imovel.bairro || "";
  if (!cidade || !uf) {
    console.log(`[Meta] Pulado ${id}: cidade/estado vazios`);
    return null;
  }

  // Preço
  const tipoTransacao = listingType(imovel.transacao);
  let preco = 0;
  if (tipoTransacao === "for_rent") {
    preco = toInt(imovel.valorAluguel);
  } else {
    preco = toInt(imovel.preco) || toInt(imovel.valorFinal);
  }
  if (preco === 0) {
    console.log(`[Meta] Pulado ${id}: sem preço`);
    return null;
  }

  // Nome (título)
  let name = (imovel.titulo || `${imovel.tipo} em ${bairro}`).trim();
  if (name.length > 100) name = name.substring(0, 97) + "...";

  const descricao = (imovel.descricao || "").trim();
  const quartos = toInt(imovel.quartos);
  const banheiros = toInt(imovel.banheiros) || (quartos > 0 ? quartos : 0);
  const area = toMetros(imovel.metragem) || toMetros(imovel.metragemTotal);
  const enderecoCompleto = [imovel.endereco, bairro, cidade, uf].filter(Boolean).join(", ");

  // Imagens adicionais (até 19 extras = 20 total)
  const imagensAdicionais = fotos.slice(1, 20).map((url) =>
    `      <g:additional_image_link>${xmlEscape(url)}</g:additional_image_link>`
  ).join("\n");

  return `    <item>
      <g:home_listing_id>${xmlEscape(ref)}</g:home_listing_id>
      <g:name>${cdata(name)}</g:name>
      <g:availability>for_sale</g:availability>
      <g:listing_type>${tipoTransacao}</g:listing_type>
      <g:property_type>${xmlEscape(propertyType)}</g:property_type>
      <g:description>${cdata(descricao)}</g:description>
      <g:url>${xmlEscape(BASE_URL + "/imovel/" + linkRef)}</g:url>
      <g:image_link>${xmlEscape(fotos[0])}</g:image_link>
${imagensAdicionais}
      <g:price>${preco}.00 BRL</g:price>
      <g:address format="simple">
        <g:component name="addr1">${cdata(enderecoCompleto)}</g:component>
        <g:component name="city">${cdata(cidade)}</g:component>
        <g:component name="region">${xmlEscape(uf)}</g:component>
        <g:component name="country">BR</g:component>
        <g:component name="postal_code">${xmlEscape(String(imovel.cep || "").replace(/\D/g, ""))}</g:component>
      </g:address>
      <g:neighborhood>${cdata(bairro)}</g:neighborhood>
      <g:latitude>${lat}</g:latitude>
      <g:longitude>${lng}</g:longitude>
      ${quartos > 0 ? `<g:num_beds>${quartos}</g:num_beds>` : ""}
      ${banheiros > 0 ? `<g:num_baths>${banheiros}</g:num_baths>` : ""}
      ${area > 0 ? `<g:area_size>${area}</g:area_size>\n      <g:area_unit>sqm</g:area_unit>` : ""}
    </item>`;
}

exports.handler = async () => {
  try {
    const db = getDb();
    const [snap, tiposCentral] = await Promise.all([
      db.collection("imoveis").get(),
      carregarTiposCentral(),
    ]);

    const items = [];
    let totalCount = 0;
    let flagCount = 0;

    snap.forEach((doc) => {
      totalCount++;
      const imovel = { id: doc.id, ...doc.data() };
      if (!isDisponivel(imovel)) return;
      if (!apareceNosPortais(imovel)) return;
      if (!temFlagAnuncio(imovel, "Catálogo Meta")) return;
      flagCount++;
      const item = buildItem(imovel, tiposCentral);
      if (item) items.push(item);
    });

    console.log(`[Meta] Total imóveis: ${totalCount}, com flag: ${flagCount}, no feed: ${items.length}`);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Inerente Gestão Imobiliária - Catálogo de Imóveis</title>
    <link>${BASE_URL}</link>
    <description>Catálogo de imóveis disponíveis para venda e locação</description>
${items.join("\n")}
  </channel>
</rss>
`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=600",
      },
      body: xml,
    };
  } catch (err) {
    console.error("[Meta] Erro:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: `Erro ao gerar feed Meta:\n${err.message}\n\n${err.stack}`,
    };
  }
};
