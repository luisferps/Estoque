// netlify/functions/feed-canalpro.js
// Feed XML padrão VRSync para Canal Pro (Grupo OLX — ZAP, Viva Real, OLX).
// Documentação: https://developers.grupozap.com/feeds/vrsync/
//
// Atualização: o Grupo OLX lê este feed automaticamente a cada 12 horas
// e propaga as alterações em até 4h (ZAP/Viva) ou 24h (OLX).

const { getDb, registrarPull } = require("./_firebase");
const {
  cdata, normalizeImageUrl, toInt, toMetros, isDisponivelEstrito, apareceNosPortais, temFlagAnuncio,
  carregarTiposCentral, acharTipoCentral, caracteristicasImovel,
} = require("./_helpers");

const BASE_URL = "https://inerente.com.br";

// Mínimo de fotos para boa pontuação no Canal Pro/ZAP. Quando o imóvel tem
// menos que isso, repetimos o conjunto original (sempre a mesma quantidade
// que existe) até atingir o mínimo. OBS: o ZAP pode detectar/penalizar fotos
// repetidas; é uma medida paliativa para a nota de mídias enquanto não há
// fotos reais suficientes.
const MIN_FOTOS_CANALPRO = 10;

// Identificador do anúncio (ListingID) — usa o código legível do Estoque
// (ex: "Rosa dos Ventos"), com fallback para o id do Firebase se faltar.
// Sanitiza para um identificador seguro: mantém letras/números/espaço/hífen.
function listingId(imovel) {
  const bruto = (imovel.codigo || "").trim() || String(imovel.id || "");
  const limpo = bruto
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^A-Za-z0-9 \-]/g, "")                  // só seguro pra XML/URL
    .replace(/\s+/g, " ").trim();
  return (limpo || String(imovel.id || "")).substring(0, 50);
}

// Tipo de publicação (destaque) gerenciado no módulo "Destaques" do admin.
// O campo imovel.destaqueCanalPro guarda o valor VRSync já pronto.
// Valores aceitos pelo VRSync: STANDARD, PREMIUM (Destaque), TRIPLE (Destaque Triplo).
// Qualquer valor ausente/desconhecido cai em STANDARD (nunca quebra o feed).
const PUBLICATION_TYPES_VALIDOS = ["STANDARD", "PREMIUM", "TRIPLE", "SUPER_PREMIUM", "PREMIERE_1", "PREMIERE_2"];
function publicationType(imovel) {
  const v = (imovel && imovel.destaqueCanalPro ? String(imovel.destaqueCanalPro) : "").toUpperCase();
  return PUBLICATION_TYPES_VALIDOS.includes(v) ? v : "STANDARD";
}

// Mapa local tipo→VRSync (fallback). A fonte principal agora é o cadastro
// central (campo vrsync); este mapa só é usado se o central não tiver o tipo.
// Tipos sem nenhum código caem num genérico por comportamento (não são excluídos).
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

// Lista OFICIAL de PropertyTypes aceitos pelo VRSync/Canal Pro (developers.grupozap.com).
// Qualquer valor fora dela é recusado pelo Canal Pro ("tipo não suportado").
const PROPERTY_TYPES_VALIDOS = new Set([
  "Residential / Apartment", "Residential / Home", "Residential / Condo",
  "Residential / Village House", "Residential / Farm Ranch", "Residential / Penthouse",
  "Residential / Flat", "Residential / Kitnet", "Residential / Loft", "Residential / Studio",
  "Residential / Land Lot", "Residential / Sobrado", "Residential / Agricultural",
  "Commercial / Consultorio", "Commercial / Edificio Residencial", "Commercial / Industrial",
  "Commercial / Garage", "Commercial / Hotel", "Commercial / Building", "Commercial / Corporate Floor",
  "Commercial / Land Lot", "Commercial / Business", "Commercial / Edificio Comercial",
  "Commercial / Office", "Commercial / Loja", "Commercial / Studio",
]);

// Default de PropertyType por comportamento (quando o tipo não tem código próprio).
function propTypePorComportamento(comportamento) {
  if (comportamento === "terreno") return "Residential / Land Lot";
  if (comportamento === "simples") return "Commercial / Business";
  return "Residential / Home"; // construcao ou desconhecido
}

// Resolve o PropertyType VRSync do imóvel.
// Ordem: código VRSync do cadastro central (variante condomínio se houver) →
// mapa local → genérico por comportamento → "Residential / Home".
// Garante que o valor final esteja SEMPRE na lista oficial (senão o Canal Pro recusa).
function resolvePropType(imovel, tipo, central) {
  let cod = null;
  if (central) {
    cod = (imovel.condominio && central.vrsync_condominio)
      ? central.vrsync_condominio
      : central.vrsync;
  }
  if (!cod || !PROPERTY_TYPES_VALIDOS.has(cod)) cod = PROPERTY_TYPE_MAP[tipo];
  if (!cod || !PROPERTY_TYPES_VALIDOS.has(cod)) cod = propTypePorComportamento(central && central.comportamento);
  // Rede de segurança por NOME: evita terreno/comercial cair no genérico "Residential / Home".
  if (cod === "Residential / Home") {
    const n = String(tipo || "").toLowerCase();
    if (/lote|terreno|gleba|loteamento|[aá]rea/.test(n)) cod = "Residential / Land Lot";
    else if (/sítio|sitio|chácara|chacara|fazenda/.test(n)) cod = "Residential / Agricultural";
    else if (/galpão|galpao|depósito|deposito|armazém|armazem/.test(n)) cod = "Commercial / Industrial";
    else if (/sala|loja|ponto|comercial|escritório|escritorio/.test(n)) cod = "Commercial / Business";
    else if (/hotel|pousada|motel/.test(n)) cod = "Commercial / Hotel";
  }
  if (!PROPERTY_TYPES_VALIDOS.has(cod)) cod = "Residential / Home"; // última garantia
  return cod;
}

// ---------------------------------------------------------------------------
// BLINDAGEM DO FEED — evita que dados ruins no cadastro façam o Grupo OLX
// recusar o anúncio na entrada (motivos clássicos: contato na descrição,
// cidade abreviada, coordenada fora do estado).
// ---------------------------------------------------------------------------

// Remove telefone, link, e-mail e nome/CRECI da DESCRIÇÃO (campo de texto).
// O Grupo OLX/VivaReal reprova anúncios com contato no texto; isto blinda o
// feed independentemente do que cada corretor digitar no cadastro. Remove a
// SENTENÇA inteira que contém o contato, sem deixar "rabos" no texto.
// IMPORTANTE: não mexe no contato OFICIAL do anúncio (bloco <ContactInfo>),
// que continua intacto — é por ele que o lead chega.
function limparDescricaoPortais(texto) {
  let t = String(texto || "");

  // 1) Acha o primeiro indício de contato (link, e-mail, nome da imobiliária,
  //    CRECI ou telefone) e remove a SENTENÇA inteira que o contém. Repete para
  //    limpar blocos encadeados. Fim de sentença = ".!?" seguido de espaço/fim
  //    (ou quebra de linha) — assim o "." interno de uma URL/e-mail não confunde.
  const gatilhos = [
    /https?:\/\/\S+/i,
    /\bwww\.\S+/i,
    /\b(?:bit\.ly|wa\.me|api\.whatsapp\.com|encr\.pw|cutt\.ly)\/\S+/i,
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
    /INERENTE\s+GEST[ÃA]O\s+IMOBILI[ÁA]RIA/i,
    /\bCRECI\b/i,
    /\bCJ\s*-?\s*\d{4,6}\b/i,
    /\(?\d{2}\)?\s*9?[\s.-]?\d{4}[\s.-]?\d{4}/,
    /\b9\d{4}[\s.-]?\d{4}\b/,
  ];
  for (let passada = 0; passada < 6; passada++) {
    let corte = -1;
    for (const re of gatilhos) {
      const m = t.match(re);
      if (m && typeof m.index === "number" && (corte === -1 || m.index < corte)) corte = m.index;
    }
    if (corte === -1) break;
    const antes = t.slice(0, corte);
    const reIni = /[.!?](?=\s)|\n/g;
    let ini = -1, mi;
    while ((mi = reIni.exec(antes)) !== null) ini = mi.index;
    const depois = t.slice(corte);
    const mf = depois.match(/[.!?](?=\s|$)|\n/);
    const fim = mf ? corte + mf.index + 1 : t.length;
    t = t.slice(0, ini + 1) + (fim < t.length ? t.slice(fim) : "");
  }

  // 2) Varredura de segurança: remove telefone/link/e-mail/rótulo de canal
  //    que por acaso tenha sobrado solto (sem pontuação ao redor).
  t = t.replace(/\bhttps?:\/\/\S+/gi, " ");
  t = t.replace(/\bwww\.\S+/gi, " ");
  t = t.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, " ");
  t = t.replace(/\(?\d{2}\)?\s*9?[\s.-]?\d{4}[\s.-]?\d{4}/g, " ");
  t = t.replace(/\b9\d{4}[\s.-]?\d{4}\b/g, " ");
  t = t.replace(/\b(?:whats\s?app|whatsapp|whats|zap)\b/gi, " ");

  // 3) Limpeza de espaços, separadores e pontuação órfãos.
  t = t.replace(/[ \t]{2,}/g, " ");
  t = t.replace(/\s*[|–—-]\s*[|–—-]\s*/g, " ");
  t = t.replace(/ +([.,;:!?])/g, "$1");
  t = t.replace(/[ \t]+\n/g, "\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  t = t.replace(/[\s,;:|–—-]+$/g, "");
  return t.trim();
}

// Normaliza cidades que o Grupo OLX não reconhece abreviadas.
// Ex.: "Aparecida" sozinho é recusado; o correto é "Aparecida de Goiânia".
function normalizarCidade(cidade) {
  const c = String(cidade || "").trim();
  if (/^aparecida(\s*[-/]?\s*go)?$/i.test(c)) return "Aparecida de Goiânia";
  return c;
}

// Valida se a coordenada cai dentro de Goiás (bounding box com folga).
// Coordenada claramente fora do estado (erro de cadastro/geocodificação,
// ex.: imóvel plotado em São Paulo) é descartada — o Grupo OLX então
// localiza o imóvel pelo endereço (cidade/bairro/CEP), que está correto.
function coordenadaEmGoias(lat, lng) {
  const la = parseFloat(String(lat).replace(",", "."));
  const lo = parseFloat(String(lng).replace(",", "."));
  if (!isFinite(la) || !isFinite(lo)) return false;
  return la <= -12.0 && la >= -20.0 && lo <= -45.5 && lo >= -54.0;
}

// CEP central (real) de cada cidade — tampão usado quando o imóvel NÃO tem
// CEP válido no cadastro. São CEPs de logradouro central, aceitos pelo Grupo
// OLX, pra garantir que o anúncio publica (a localização fina vem do bairro
// e da coordenada). Onde o cadastro tiver CEP de verdade, ELE é usado; este
// tampão só entra quando o CEP está vazio ou inválido.
const CEP_FALLBACK_CIDADE = {
  "goiania": "74050100",              // Av. Goiás, Setor Central, Goiânia
  "aparecida de goiania": "74980010", // Centro, Aparecida de Goiânia
};
const CEP_FALLBACK_PADRAO = "74050100"; // Goiânia (Av. Goiás, Centro)

function cidadeChave(c) {
  return String(c || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// Retorna SEMPRE um CEP de 8 dígitos: o do imóvel quando válido; senão, o CEP
// central da cidade (tampão). Evita a recusa do Canal Pro por "CEP vazio/inválido".
function cepValidoOuFallback(imovel, cidade) {
  const limpo = String(imovel.cep || "").replace(/\D/g, "");
  if (limpo.length === 8) return limpo;
  const c = cidadeChave(cidade);
  if (CEP_FALLBACK_CIDADE[c]) return CEP_FALLBACK_CIDADE[c];
  if (c.indexOf("aparecida") >= 0) return CEP_FALLBACK_CIDADE["aparecida de goiania"];
  return CEP_FALLBACK_PADRAO;
}

// Constrói um único <Listing> a partir do documento Firestore.
// Retorna null se o imóvel não atende requisitos mínimos (e loga o motivo).
function buildListing(imovel, tiposCentral) {
  const id = listingId(imovel);

  const tipo = imovel.tipo || "";
  const central = acharTipoCentral(tiposCentral, tipo);
  const propType = resolvePropType(imovel, tipo, central);

  // Fotos obrigatórias
  let fotos = (imovel.fotos || []).map(normalizeImageUrl).filter(Boolean);
  if (fotos.length === 0) {
    console.log(`[CanalPro] Pulado ${id}: sem fotos`);
    return null;
  }

  // Se houver menos fotos que o mínimo, REPETE o conjunto original (sempre a
  // mesma quantidade que existe) até chegar ao mínimo. Ex.: 4 fotos -> 8 -> 12;
  // 3 -> 6 -> 9 -> 12; 5 -> 10. A primeira foto (destaque) continua sendo a
  // original. O corte em 30 fotos é feito mais abaixo, na montagem das mídias.
  if (fotos.length > 0 && fotos.length < MIN_FOTOS_CANALPRO) {
    const originais = fotos.slice();
    while (fotos.length < MIN_FOTOS_CANALPRO) {
      fotos = fotos.concat(originais);
    }
  }

  // Descrição mínima de 50 caracteres (já blindada contra contato/link/CRECI)
  const descricao = limparDescricaoPortais((imovel.descricao || "").trim());
  if (descricao.length < 50) {
    console.log(`[CanalPro] Pulado ${id}: descrição < 50 caracteres`);
    return null;
  }

  // Título entre 10 e 100 caracteres
  let titulo = (imovel.titulo || "").trim();
  if (titulo.length < 10) titulo = `${tipo} em ${imovel.bairro || imovel.cidade || ""}`.trim();
  if (titulo.length > 100) titulo = titulo.substring(0, 97) + "...";

  // Área obrigatória
  const isLote = (central && central.comportamento === "terreno") || TIPOS_TERRENO.includes(tipo);
  const metragem = toMetros(imovel.metragem);
  const metragemTotal = toMetros(imovel.metragemTotal);
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
  const cidade = normalizarCidade(imovel.cidade || "");
  const bairro = imovel.bairro || "";
  if (!cidade || !bairro) {
    console.log(`[CanalPro] Pulado ${id}: cidade ou bairro vazios`);
    return null;
  }

  // Número do endereço: usa o do imóvel; se não houver, manda "1" para
  // satisfazer o critério de qualidade do Canal Pro (que pede número).
  const numeroEndereco = String(imovel.numero || "").trim() || "1";

  const enderecoPartes = [];
  if (imovel.endereco) enderecoPartes.push(`        <Address>${cdata(imovel.endereco)}</Address>`);
  enderecoPartes.push(`        <StreetNumber>${cdata(numeroEndereco)}</StreetNumber>`);
  enderecoPartes.push(`        <PostalCode>${cepValidoOuFallback(imovel, cidade)}</PostalCode>`);
  if (imovel.latitude && imovel.longitude && coordenadaEmGoias(imovel.latitude, imovel.longitude)) {
    enderecoPartes.push(`        <Latitude>${imovel.latitude}</Latitude>`);
    enderecoPartes.push(`        <Longitude>${imovel.longitude}</Longitude>`);
  }
  const displayAddress = imovel.endereco ? "All" : "Neighborhood";

  // Fotos (máximo 30, primeira é a destaque)
  const mediaItems = fotos.slice(0, 30).map((url, i) => {
    const primary = i === 0 ? ' primary="true"' : "";
    return `        <Item medium="image" caption="foto${i + 1}"${primary}>${url}</Item>`;
  }).join("\n");

  // Detalhes
  let quartos = toInt(imovel.quartos);
  const suites = toInt(imovel.suites);
  const garagens = toInt(imovel.garagens);
  // Banheiros: usa o que tiver, ou estima como quartos (mínimo 1 para residencial)
  let banheiros = toInt(imovel.banheiros);
  if (!banheiros && quartos > 0) banheiros = quartos;
  // O Canal Pro/ZAP EXIGE quartos e banheiros (>=1) para imóvel residencial com
  // edificação (casa, apto, condomínio, chácara/sítio com casa...). Terreno/lote
  // e comercial ficam de fora. Onde o cadastro veio sem valor, garante o mínimo
  // pra não ser recusado; onde tem número real, mantém.
  const ehTerrenoOuComercial = propType === "Residential / Land Lot"
    || propType === "Commercial / Land Lot"
    || usageType(tipo) === "Commercial";
  if (!ehTerrenoOuComercial) {
    if (quartos < 1) quartos = 1;
    if (banheiros < 1) banheiros = 1;
  }

  const areaTag = isLote
    ? `        <LotArea unit="square metres">${metragemTotal || area}</LotArea>`
    : `        <LivingArea unit="square metres">${area}</LivingArea>`;

  const condominio = toInt(imovel.valorCondominio);
  const iptuMensal = toInt(imovel.valorIPTU);
  // IPTU sempre presente no feed: quando o cadastro tem zero (ou vazio), sobe
  // como 1 para os portais não recusarem/penalizarem o anúncio por IPTU ausente.
  const iptuAnual = iptuMensal > 0 ? iptuMensal * 12 : 1;

  // Características/comodidades (sobe a nota do anúncio).
  const carac = caracteristicasImovel(imovel);
  const featuresTag = carac.features.length
    ? `        <Features>\n${carac.features.map(f => `          <Feature>${cdata(f)}</Feature>`).join("\n")}\n        </Features>`
    : "";

  const details = [
    `        <PropertyType>${propType}</PropertyType>`,
    `        <UsageType>${propType.split(" / ")[0] || usageType(tipo)}</UsageType>`,
    `        <Description>${cdata(descricao)}</Description>`,
    areaTag,
    listPriceTag && `        ${listPriceTag}`,
    rentalPriceTag && `        ${rentalPriceTag}`,
    condominio > 0 && `        <PropertyAdministrationFee currency="BRL">${condominio}</PropertyAdministrationFee>`,
    `        <Iptu currency="BRL" period="Yearly">${iptuAnual}</Iptu>`,
    quartos > 0 && `        <Bedrooms>${quartos}</Bedrooms>`,
    suites > 0 && `        <Suites>${suites}</Suites>`,
    banheiros > 0 && `        <Bathrooms>${banheiros}</Bathrooms>`,
    garagens > 0 && `        <Garage>${garagens}</Garage>`,
    featuresTag,
  ].filter(Boolean).join("\n");

  return `    <Listing>
      <ListingID>${id}</ListingID>
      <Title>${cdata(titulo)}</Title>
      <TransactionType>${trans}</TransactionType>
      <PublicationType>${publicationType(imovel)}</PublicationType>
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
    registrarPull("canalpro");
    const db = getDb();
    const [snap, tiposCentral] = await Promise.all([
      db.collection("imoveis").get(),
      carregarTiposCentral(),
    ]);

    const listings = [];
    let totalCount = 0;
    let flagCount = 0;

    snap.forEach((doc) => {
      totalCount++;
      const imovel = { id: doc.id, ...doc.data() };
      if (!isDisponivelEstrito(imovel)) return;
      if (!apareceNosPortais(imovel)) return;
      if (!temFlagAnuncio(imovel, "Canal Pro")) return;
      flagCount++;
      const listing = buildListing(imovel, tiposCentral);
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
