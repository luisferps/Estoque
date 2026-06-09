// netlify/functions/feed-chavesnamao.js
// Feed XML padrão Chaves na Mão.
// Documentação: https://tecnologiacnm.github.io/cnm-xml-documentation/
//
// O Chaves na Mão lê este feed automaticamente uma vez por dia após a
// ativação por e-mail (atendimento@chavesnamao.com.br).

const { getDb } = require("./_firebase");
const {
  cdata, normalizeImageUrl, toFloat, toInt, isDisponivel, temFlagAnuncio,
  carregarTiposCentral, acharTipoCentral,
} = require("./_helpers");

const BASE_URL = "https://imoveisdisponiveis.netlify.app";

// Identificador/refrência do anúncio — usa o código legível do Estoque
// (ex: "Rosa dos Ventos"), com fallback para o id do Firebase se faltar.
// Sanitiza para algo seguro como referência.
function refImovel(imovel) {
  const bruto = (imovel.codigo || "").trim() || String(imovel.id || "");
  const limpo = bruto
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 \-]/g, "")
    .replace(/\s+/g, " ").trim();
  return limpo || String(imovel.id || "");
}

// Mapeamento tipo do app → tipo aceito pelo Chaves na Mão (residencial).
// Lista oficial: https://tecnologiacnm.github.io/cnm-xml-documentation/arquivo/dados-suportados/residencial.html
const TIPO_MAP_RESIDENCIAL = {
  "Apartamento": "Apartamento",
  "Casa": "Casa / Sobrado",
  "Sobrado": "Casa / Sobrado",
  "Casa de Condomínio": "Casa / Sobrado em Condomínio",
  "Cobertura": "Cobertura",
  "Flat": "Flat",
  "Kitnet": "Kitnet / Stúdio",
  "Studio": "Kitnet / Stúdio",
  "Loft": "Loft",
  "Sítio": "Sítio / Chácara",
  "Chácara": "Sítio / Chácara",
  "Fazenda": "Sítio / Chácara",
  "Área": "Sítio / Chácara",
  "Lote": "Terreno / Lote",
  "Terreno": "Terreno / Lote",
};

// Mapeamento tipo do app → tipo aceito pelo Chaves na Mão (comercial).
const TIPO_MAP_COMERCIAL = {
  "Galpão": "Galpão / Depósito",
  "Depósito": "Galpão / Depósito",
  "Sala Comercial": "Sala Comercial",
  "Sala": "Sala Comercial",
  "Loja": "Loja",
  "Ponto Comercial": "Loja",
  "Hotel": "Hotel / Motel / Pousada",
  "Pousada": "Hotel / Motel / Pousada",
};

// Decide finalidade ("RE" residencial / "CO" comercial / "RU" rural).
// Se o tipo não estiver nos mapas curados, usa o comportamento do cadastro
// central pra escolher um tipo genérico — assim o imóvel publica em vez de sumir.
function finalidadeETipo(imovelTipo, central) {
  if (TIPO_MAP_RESIDENCIAL[imovelTipo]) {
    // Sítio/Chácara/Fazenda/Área podem ser "RU" (rural) também
    if (["Sítio", "Chácara", "Fazenda", "Área"].includes(imovelTipo)) {
      return { finalidade: "RU", tipo: TIPO_MAP_RESIDENCIAL[imovelTipo] };
    }
    return { finalidade: "RE", tipo: TIPO_MAP_RESIDENCIAL[imovelTipo] };
  }
  if (TIPO_MAP_COMERCIAL[imovelTipo]) {
    return { finalidade: "CO", tipo: TIPO_MAP_COMERCIAL[imovelTipo] };
  }
  // Fallback por comportamento (tipo novo/não mapeado)
  const comp = central && central.comportamento;
  if (comp === "simples") return { finalidade: "CO", tipo: "Sala Comercial" };
  if (comp === "terreno") return { finalidade: "RE", tipo: "Terreno / Lote" };
  return { finalidade: "RE", tipo: "Casa / Sobrado" }; // construcao ou desconhecido
}

// Decide transação principal e secundária.
// V = Venda, L = Locação.
function transacoes(t) {
  if (!t) return { principal: "V", secundaria: "" };
  const lower = t.toLowerCase();
  const temVenda = lower.includes("venda");
  const temLocacao = lower.includes("locação") || lower.includes("locacao") || lower.includes("aluguel");
  if (temVenda && temLocacao) return { principal: "V", secundaria: "L" };
  if (temLocacao) return { principal: "L", secundaria: "" };
  return { principal: "V", secundaria: "" };
}

function buildImovel(imovel, tiposCentral) {
  const id = String(imovel.id);
  const ref = refImovel(imovel);
  const linkRef = encodeURIComponent(ref);

  // Tipo (sempre resolve — usa central como fallback, não exclui mais)
  const central = acharTipoCentral(tiposCentral, imovel.tipo || "");
  const ft = finalidadeETipo(imovel.tipo || "", central);

  // Localização (obrigatórios: estado, cidade, bairro)
  const uf = (imovel.estado || "").substring(0, 2).toUpperCase();
  const cidade = imovel.cidade || "";
  const bairro = imovel.bairro || "";
  if (!uf || !cidade || !bairro) {
    console.log(`[ChavesNaMao] Pulado ${id}: estado/cidade/bairro vazios`);
    return null;
  }

  // Descrição obrigatória
  const descritivo = (imovel.descricao || "").trim();
  if (!descritivo) {
    console.log(`[ChavesNaMao] Pulado ${id}: sem descrição`);
    return null;
  }

  // Transação e valores
  const trans = transacoes(imovel.transacao);
  let valorPrincipal = 0;
  let valorLocacao = 0;
  if (trans.principal === "V") {
    valorPrincipal = toFloat(imovel.preco) || toFloat(imovel.valorFinal);
    if (trans.secundaria === "L") {
      valorLocacao = toFloat(imovel.valorAluguel);
    }
  } else {
    valorPrincipal = toFloat(imovel.valorAluguel);
  }
  if (valorPrincipal === 0) {
    console.log(`[ChavesNaMao] Pulado ${id}: sem valor`);
    return null;
  }

  // Fotos (até 30)
  const fotos = (imovel.fotos || []).map(normalizeImageUrl).filter(Boolean).slice(0, 30);
  const hoje = new Date().toISOString().substring(0, 19).replace("T", " ");
  const fotosXml = fotos.map((url) => `            <foto>
                <url><![CDATA[${url}]]></url>
                <data_atualizacao>${hoje}</data_atualizacao>
            </foto>`).join("\n");

  // Detalhes numéricos
  const quartos = toInt(imovel.quartos);
  const suites = toInt(imovel.suites);
  const garagens = toInt(imovel.garagens);
  const banheiros = toInt(imovel.banheiros) || (quartos > 0 ? quartos : 0);
  const areaUtil = toFloat(imovel.metragem);
  const areaTotal = toFloat(imovel.metragemTotal);
  const iptu = toFloat(imovel.valorIPTU);
  const condominio = toFloat(imovel.valorCondominio);

  const cep = imovel.cep ? String(imovel.cep).replace(/\D/g, "") : "";
  const aceitaPermuta = (imovel.condicoes || []).includes("Permuta") ? 1 : 0;

  return `        <imovel>
            <referencia>${cdata(ref)}</referencia>
            <codigo_cliente>${cdata(ref)}</codigo_cliente>
            <link_cliente><![CDATA[${BASE_URL}/imovel/${linkRef}]]></link_cliente>
            <titulo>${cdata(imovel.titulo || "")}</titulo>
            <transacao>${trans.principal}</transacao>
            <transacao2>${trans.secundaria}</transacao2>
            <finalidade>${ft.finalidade}</finalidade>
            <finalidade2></finalidade2>
            <destaque>0</destaque>
            <tipo>${cdata(ft.tipo)}</tipo>
            <tipo2></tipo2>
            <valor>${valorPrincipal.toFixed(2)}</valor>
            <valor_locacao>${valorLocacao > 0 ? valorLocacao.toFixed(2) : ""}</valor_locacao>
            <valor_iptu>${iptu > 0 ? iptu.toFixed(2) : ""}</valor_iptu>
            <valor_condominio>${condominio > 0 ? condominio.toFixed(2) : ""}</valor_condominio>
            <area_total>${areaTotal > 0 ? areaTotal.toFixed(2) : ""}</area_total>
            <area_util>${areaUtil > 0 ? areaUtil.toFixed(2) : ""}</area_util>
            <quartos>${quartos || ""}</quartos>
            <suites>${suites || ""}</suites>
            <garagem>${garagens || ""}</garagem>
            <banheiro>${banheiros || ""}</banheiro>
            <estado>${uf}</estado>
            <cidade>${cdata(cidade)}</cidade>
            <bairro>${cdata(bairro)}</bairro>
            <cep>${cep}</cep>
            <endereco>${cdata(imovel.endereco || "")}</endereco>
            <numero></numero>
            <complemento></complemento>
            <descritivo>${cdata(descritivo)}</descritivo>
            <data_atualizacao>${hoje}</data_atualizacao>
            <latitude>${imovel.latitude || ""}</latitude>
            <longitude>${imovel.longitude || ""}</longitude>
            <aceita_troca>${aceitaPermuta}</aceita_troca>
            <fotos_imovel>
${fotosXml}
            </fotos_imovel>
        </imovel>`;
}

exports.handler = async () => {
  try {
    const db = getDb();
    const [snap, tiposCentral] = await Promise.all([
      db.collection("imoveis").get(),
      carregarTiposCentral(),
    ]);

    const imoveis = [];
    let totalCount = 0;
    let flagCount = 0;

    snap.forEach((doc) => {
      totalCount++;
      const imovel = { id: doc.id, ...doc.data() };
      if (!isDisponivel(imovel)) return;
      if (!temFlagAnuncio(imovel, "Chaves na Mão")) return;
      flagCount++;
      const item = buildImovel(imovel, tiposCentral);
      if (item) imoveis.push(item);
    });

    console.log(`[ChavesNaMao] Total imóveis: ${totalCount}, com flag: ${flagCount}, no feed: ${imoveis.length}`);

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<Document>
    <imoveis>
${imoveis.join("\n")}
    </imoveis>
</Document>
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
    console.error("[ChavesNaMao] Erro:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: `Erro ao gerar feed Chaves na Mão:\n${err.message}\n\n${err.stack}`,
    };
  }
};
