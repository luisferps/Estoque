// netlify/functions/feed-canalpro.js
// Feed XML padrão VRSync para Canal Pro (Grupo OLX — ZAP, Viva Real, OLX).
// Documentação: https://developers.grupozap.com/feeds/vrsync/
//
// Atualização: o Grupo OLX lê este feed automaticamente a cada 12 horas
// e propaga as alterações em até 4h (ZAP/Viva) ou 24h (OLX).

const { getDb } = require("./_firebase");
const {
  cdata, normalizeImageUrl, toInt, isDisponivel, temFlagAnuncio,
} = require("./_helpers");

const BASE_URL = "https://imoveisdisponiveis.netlify.app";

// Mapeamento tipo do app → PropertyType do VRSync.
// IMPORTANTE: tipos cadastrados aqui pelo Luis precisam estar listados.
// Tipos não mapeados resultam em exclusão do imóvel do feed.
const PROPERTY_TYPE_MAP = {
  "Apartamento": "Residential / Apartment",
  "Casa": "Residential / Home",
  "Sobrado": "Residential / Sobrado",
  "Casa de Condomínio": "Residential / Condo",
  "Cobertura": "Residential / Penthouse",
  "Flat": "Residential / Flat",
  "Kitnet": "Residential / Kitnet",
  "Loft": "Residential / Loft",
  "Studio": "Residential / Studio",
  "Lote": "Residential / Land Lot",
  "Terreno": "Residential / Land Lot",
  "Área": "Residential / Farm Ranch",
  "Sítio": "Residential / Agricultural",
  "Chácara": "Residential / Agricultural",
  "Fazenda": "Residential / Agricultural",
  "Galpão": "Commercial / Industrial",
  "Depósito": "Commercial / Industrial",
  "Sala Comercial": "Commercial / Office",
  "Sala": "Commercial / Office",
  "Loja": "Commercial / Business",
  "Ponto Comercial": "Commercial / Business",
  "Hotel": "Commercial / Hotel",
  "Pousada": "Commercial / Hotel",
};

// Tipos considerados "terrenos" (usam LotArea ao invés de LivingArea).
const TIPOS_TERRENO = ["Lote", "Terreno", "Área", "Sítio", "Chácara", "Fazenda", "Galpão", "Depósito"];

// Tipos considerados "comerciais" (UsageType).
function usageType(tipo) {
  if (!tipo) return "Residential";
  const t = tipo.toLowerCase();
  if (t.includes("comercial") || t.includes("galpão") || t.includes("galpao") ||
      t.includes("loja") || t.includes("sala") || t.includes("hotel") ||
      t.includes("depósito") || t.includes("deposito") || t.includes("ponto")) {
    return "Commercial";
  }
  return "Residential";
}

// Mapeamento transação → TransactionType.
function transactionType(t) {
  if (!t) return "For Sale";
  const lower = t.toLowerCase();
  if (lower.includes("venda") && (lower.includes("locação") || lower.includes("locacao") || lower.includes("aluguel"))) {
    return "Sale/Rent";
  }
  if (lower.includes("locação") || lower.includes("locacao") || lower.includes("aluguel")) {
    return "For Rent";
  }
  return "For Sale";
}

// Constrói um único <Listing> a partir do documento Firestore.
// Retorna null se o imóvel não atende requisitos mínimos (e loga o motivo).
function buildListing(imovel) {
  const id = String(imovel.id).substring(0, 50);

  // Tipo obrigatório e precisa estar mapeado
  const tipo = imovel.tipo || "";
  const propType = PROPERTY_TYPE_MAP[tipo];
  if (!propType) {
    console.log(`[CanalPro] Pulado ${id}: tipo "${tipo}" não mapeado`);
    return null;
  }

  // Fotos obrigatórias
  const fotos = (imovel.fotos || []).map(normalizeImageUrl).filter(Boolean);
  if (fotos.length === 0) {
    console.log(`[CanalPro] Pulado ${id}: sem fotos`);
    return null;
  }

  // Descrição mínima de 50 caracteres
  const descricao = (imovel.descricao || "").trim();
  if (descricao.length < 50) {
    console.log(`[CanalPro] Pulado ${id}: descrição < 50 caracteres`);
    return null;
  }

  // Título entre 10 e 100 caracteres
  let titulo = (imovel.titulo || "").trim();
  if (titulo.length < 10) titulo = `${tipo} em ${imovel.bairro || imovel.cidade || ""}`.trim();
  if (titulo.length > 100) titulo = titulo.substring(0, 97) + "...";

  // Área obrigatória
  const isLote = TIPOS_TERRENO.includes(tipo);
  const metragem = toInt(imovel.metragem);
  const metragemTotal = toInt(imovel.metragemTotal);
  const area = isLote ? (metragemTotal || metragem) : (metragem || metragemTotal);
  if (area === 0) {
    console.log(`[CanalPro] Pulado ${id}: sem metragem`);
    return null;
  }

  // Preços
  const trans = transactionType(imovel.transacao);
  const isVenda = trans === "For Sale" || trans === "Sale/Rent";
  const isLocacao = trans === "For Rent" || trans === "Sale/Rent";

  let listPriceTag = "";
  let rentalPriceTag = "";
  if (isVenda) {
    const preco = toInt(imovel.preco) || toInt(imovel.valorFinal);
    if (preco > 0) listPriceTag = `<ListPrice currency="BRL">${preco}</ListPrice>`;
  }
  if (isLocacao) {
    const aluguel = toInt(imovel.valorAluguel);
    if (aluguel > 0) rentalPriceTag = `<RentalPrice currency="BRL" period="Monthly">${aluguel}</RentalPrice>`;
  }
  if (!listPriceTag && !rentalPriceTag) {
    console.log(`[CanalPro] Pulado ${id}: sem preço válido`);
    return null;
  }

  // Localização — Country, State, City, Neighborhood são obrigatórios
  const uf = (imovel.estado || "GO").substring(0, 2).toUpperCase();
  const estadoNome = imovel.estadoNome || "Goiás";
  const cidade = imovel.cidade || "";
  const bairro = imovel.bairro || "";
  if (!cidade || !bairro) {
    console.log(`[CanalPro] Pulado ${id}: cidade ou bairro vazios`);
    return null;
  }

  const enderecoPartes = [];
  if (imovel.endereco) enderecoPartes.push(`        <Address>${cdata(imovel.endereco)}</Address>`);
  if (imovel.cep) enderecoPartes.push(`        <PostalCode>${String(imovel.cep).replace(/\D/g, "")}</PostalCode>`);
  if (imovel.latitude && imovel.longitude) {
    enderecoPartes.push(`        <Latitude>${imovel.latitude}</Latitude>`);
    enderecoPartes.push(`        <Longitude>${imovel.longitude}</Longitude>`);
  }
  const displayAddress = imovel.endereco ? "Street" : "Neighborhood";

  // Fotos (máximo 30, primeira é a destaque)
  const mediaItems = fotos.slice(0, 30).map((url, i) => {
    const primary = i === 0 ? ' primary="true"' : "";
    return `        <Item medium="image" caption="foto${i + 1}"${primary}>${url}</Item>`;
  }).join("\n");

  // Detalhes
  const quartos = toInt(imovel.quartos);
  const suites = toInt(imovel.suites);
  const garagens = toInt(imovel.garagens);
  // Banheiros: usa o que tiver, ou estima como quartos (mínimo 1 para residencial)
  let banheiros = toInt(imovel.banheiros);
  if (!banheiros && quartos > 0) banheiros = quartos;

  const areaTag = isLote
    ? `        <LotArea unit="square metres">${metragemTotal || area}</LotArea>`
    : `        <LivingArea unit="square metres">${area}</LivingArea>`;

  const condominio = toInt(imovel.valorCondominio);
  const iptuMensal = toInt(imovel.valorIPTU);

  const details = [
    `        <PropertyType>${propType}</PropertyType>`,
    `        <UsageType>${usageType(tipo)}</UsageType>`,
    `        <Description>${cdata(descricao)}</Description>`,
    areaTag,
    listPriceTag && `        ${listPriceTag}`,
    rentalPriceTag && `        ${rentalPriceTag}`,
    condominio > 0 && `        <PropertyAdministrationFee currency="BRL">${condominio}</PropertyAdministrationFee>`,
    iptuMensal > 0 && `        <Iptu currency="BRL" period="Yearly">${iptuMensal * 12}</Iptu>`,
    quartos > 0 && `        <Bedrooms>${quartos}</Bedrooms>`,
    suites > 0 && `        <Suites>${suites}</Suites>`,
    banheiros > 0 && `        <Bathrooms>${banheiros}</Bathrooms>`,
    garagens > 0 && `        <Garage>${garagens}</Garage>`,
  ].filter(Boolean).join("\n");

  return `    <Listing>
      <ListingID>${id}</ListingID>
      <Title>${cdata(titulo)}</Title>
      <TransactionType>${trans}</TransactionType>
      <PublicationType>STANDARD</PublicationType>
      <Location displayAddress="${displayAddress}">
        <Country abbreviation="BR">Brasil</Country>
        <State abbreviation="${uf}">${cdata(estadoNome)}</State>
        <City>${cdata(cidade)}</City>
        <Neighborhood>${cdata(bairro)}</Neighborhood>
${enderecoPartes.join("\n")}
      </Location>
      <Media>
${mediaItems}
      </Media>
      <ContactInfo>
        <Name>Inerente Gestão Imobiliária</Name>
        <Email>contato@inerente.com.br</Email>
        <Telephone>(62) 98228-1861</Telephone>
      </ContactInfo>
      <Details>
${details}
      </Details>
    </Listing>`;
}

exports.handler = async () => {
  try {
    const db = getDb();
    const snap = await db.collection("imoveis").get();

    const listings = [];
    let totalCount = 0;
    let flagCount = 0;

    snap.forEach((doc) => {
      totalCount++;
      const imovel = { id: doc.id, ...doc.data() };
      if (!isDisponivel(imovel)) return;
      if (!temFlagAnuncio(imovel, "Canal Pro")) return;
      flagCount++;
      const listing = buildListing(imovel);
      if (listing) listings.push(listing);
    });

    const now = new Date().toISOString().substring(0, 19);
    console.log(`[CanalPro] Total imóveis: ${totalCount}, com flag: ${flagCount}, no feed: ${listings.length}`);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListingDataFeed xmlns="http://www.vivareal.com/schemas/1.0/VRSync"
                 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                 xsi:schemaLocation="http://www.vivareal.com/schemas/1.0/VRSync http://xml.vivareal.com/vrsync.xsd">
  <Header>
    <Provider>Inerente Gestão Imobiliária</Provider>
    <Email>contato@inerente.com.br</Email>
    <ContactName>Luis Fernando</ContactName>
    <PublishDate>${now}</PublishDate>
    <Telephone>(62) 98228-1861</Telephone>
  </Header>
  <Listings>
${listings.join("\n")}
  </Listings>
</ListingDataFeed>
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
    console.error("[CanalPro] Erro:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: `Erro ao gerar feed Canal Pro:\n${err.message}\n\n${err.stack}`,
    };
  }
};
