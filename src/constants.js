// ─── Configurações de negócio ───
export const ADMIN_PASS = "123livre";
export const TIPOS = ["Lote", "Casa", "Apartamento", "Área", "Galpão"];
export const TRANSACOES = ["Venda", "Locação", "Venda e Locação"];
export const ESTADOS_IMOVEL = ["Imóvel Usado", "Imóvel Novo"];
export const STATUS_IMOVEL = ["Disponível", "Reservado", "Vendido", "Alugado"];
export const CANAIS = ["Canal Pro", "Chaves na Mão", "Marketplace Facebook", "Google Business", "Instagram", "Whatsapp", "Grupos"];
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
];

// ─── Cloudinary ───
export const CLOUDINARY_CLOUD = "demsusjwf";
export const CLOUDINARY_PRESET = "Estoque";
export const LOGO_URL = "https://res.cloudinary.com/demsusjwf/image/upload/v1778785144/logo_png_fuv27j.png";

// ─── Empresa ───
export const EMPRESA = {
  nome: "Inerente Gestão Imobiliária",
  whatsapp: "5562999999999", // ⚠️ Substituir pelo WhatsApp real da empresa
  email: "contato@inerente.com.br",
  instagram: "@inerente",
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
  id: null, titulo: "", tipo: "Casa", transacao: "Venda", estadoImovel: "Imóvel Usado",
  status: "Disponível",
  preco: "", descricao: "", extras: "", mapsLink: "",
  cep: "", cidade: "", bairro: "", endereco: "", asfalto: false, agua: false, esgoto: false,
  metragem: "", metragemTotal: "", nomeProprietario: "", telefoneProprietario: "",
  nomeCaptador: "", telefoneCaptador: "", condominio: false, nomeCondominio: "", valorCondominioMensal: "",
  declive: "Plano", muro: false, esquina: false, retangular: false, frente: "", laterais: "", medidas: "",
  quartos: "", suites: "", garagens: "", valorAvaliacao: "", valorEntrada: "", valorCondominio: "",
  valorAluguel: "", valorIPTU: "", condicoes: [], permuta: "", anuncios: {}, fotos: [],
};
