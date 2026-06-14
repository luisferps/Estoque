// ─── Configurações de negócio ───
export const ADMIN_PASS = "123livre";
export const TIPOS = ["Lote", "Casa", "Apartamento", "Área", "Galpão"];
export const TRANSACOES = ["Venda", "Locação"];
export const ESTADOS_IMOVEL = ["Imóvel Usado", "Imóvel Novo"];
export const STATUS_IMOVEL = ["Disponível", "Reservado", "Vendido", "Alugado"];
// Visibilidade pública: controla onde o imóvel aparece, independente do status.
// "Site e portais" é o padrão (comportamento atual). As demais ocultam o imóvel
// do site público e/ou dos feeds XML (Canal Pro, Chaves na Mão, Meta).
export const VISIBILIDADE_IMOVEL = ["Site e portais", "Ocultar do site", "Ocultar dos portais", "Ocultar de tudo"];

// ─── Canais de anúncio ───
// Os canais marcados com ⚙ são integrados automaticamente via XML feed.
// Os demais são marcação manual (para controle interno do que foi divulgado).
export const CANAIS = [
  "Canal Pro",          // ⚙ XML feed (ZAP, Viva Real, OLX)
  "Chaves na Mão",      // ⚙ XML feed
  "Catálogo Meta",      // ⚙ XML feed (Facebook + Instagram Ads)
  "Google Posts",       // 🔜 Fase 3 — API
  "Google Produtos",    // 🔜 Fase 3 — API
  "Instagram Post",     // 🔜 Fase 3 — API Meta Graph
  "Instagram Story",    // 🔜 Fase 3 — API Meta Graph
  "WhatsApp Status",    // 🔜 Fase 2 — Evolution API
  "WhatsApp Grupos",    // 🔜 Fase 2 — Evolution API
  "Marketplace Facebook", // Manual (não há API oficial)
];

export const CONDICOES = ["À vista", "Financiamento", "Permuta"];
export const RODAPE = "Valores e condições sujeitos a alteração e/ou análise sem aviso prévio e sem ônus ao anunciante.";

// ─── Ordenação ───
export const ORDENACOES = [
  { key: "recente", label: "Mais recentes" },
  { key: "antigo", label: "Mais antigos" },
  { key: "preco_menor", label: "Menor preço" },
  { key: "preco_maior", label: "Maior preço" },
  { key: "metragem_menor", label: "Menor metragem" },
  { key: "metragem_maior", label: "Maior metragem" },
  { key: "bairro_az", label: "Setor/Bairro (A-Z)" },
  { key: "bairro_za", label: "Setor/Bairro (Z-A)" },
];

// ─── Cloudinary ───
export const CLOUDINARY_CLOUD = "demsusjwf";
export const CLOUDINARY_PRESET = "Estoque";
export const LOGO_URL = "https://res.cloudinary.com/demsusjwf/image/upload/v1778785144/logo_png_fuv27j.png";

// ─── Empresa ───
export const EMPRESA = {
  nome: "Inerente Gestão Imobiliária",
  whatsapp: "5562982281861",
  telefone: "(62) 98228-1861",
  email: "contato@inerente.com.br",
  instagram: "@inerenteimobiliaria",
  endereco: "Via Gustavo Corção, 281 - Q26, L01 - Condomínio Amin Camargo, Goiânia - GO, 74355-100",
  creci: "Creci/GO 41.584",
};

// ─── Cores (CSS Variables — ver ThemeProvider) ───
export const COR_PRIMARY = "#C0392B";
export const COR_PRIMARY_DARK = "#922B21";

// ─── Campos para PDF ───
export const PDF_CAMPOS = [
  { key: "tipo", label: "Tipo/Transação" },
  { key: "status", label: "Status" },
  { key: "cidade", label: "Cidade" },
  { key: "bairro", label: "Bairro" },
  { key: "maps", label: "Localização (Maps)" },
  { key: "metragem", label: "Metragem" },
  { key: "terreno", label: "Terreno" },
  { key: "quartos", label: "Quartos" },
  { key: "suites", label: "Suítes" },
  { key: "garagens", label: "Garagens" },
  { key: "asfalto", label: "Asfalto" },
  { key: "agua", label: "Água" },
  { key: "esgoto", label: "Esgoto" },
  { key: "muro", label: "Muro" },
  { key: "medidas", label: "Medidas" },
  { key: "preco", label: "Valor/Aluguel" },
  { key: "condominio", label: "Condomínio" },
  { key: "iptu", label: "IPTU" },
  { key: "total", label: "Total Locação" },
];

// ─── Formulário vazio ───
export const emptyForm = {
  id: null, titulo: "", tipo: "Casa", transacao: "Venda", estadoImovel: "Imóvel Novo",
  status: "Disponível", visibilidade: "Site e portais",
  preco: "", descricao: "", extras: "", mapsLink: "",
  cep: "", cidade: "", bairro: "", endereco: "", estado: "", asfalto: false, agua: false, esgoto: false,
  latitude: "", longitude: "",
  metragem: "", metragemTotal: "", nomeProprietario: "", telefoneProprietario: "",
  nomeCaptador: "", telefoneCaptador: "", condominio: false, nomeCondominio: "", valorCondominioMensal: "",
  declive: "Plano", muro: false, esquina: false, retangular: false, frente: "", laterais: "", medidas: "",
  quartos: "", suites: "", garagens: "", banheiros: "", valorAvaliacao: "", valorEntrada: "", valorCondominio: "",
  valorAluguel: "", valorIPTU: "", condicoes: [], permuta: "", anuncios: {}, fotos: [],
};
