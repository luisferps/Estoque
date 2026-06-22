// Helper central de escrita de imóveis PELO BACKEND (rotas protegidas).
// O Firestore está fechado para escrita do cliente (write: if false); toda criação,
// edição e exclusão de imóvel passa por aqui, e o backend confere papel/dono antes de gravar.
//
// Usado por: Form.js, Lista.js, Detalhe.js, Anuncios.js, Importar.js.

const BACKEND_URL = "https://agentes-de-whatsapp-production.up.railway.app";

// Token de sessão do Portal (gravado em admin_sso.sessao pelo App ao resgatar o SSO).
// É o que o backend valida pra saber quem é o usuário e seu papel (diretor/corretor).
export function tokenSessaoSSO() {
  try {
    const raw = localStorage.getItem("admin_sso");
    if (!raw) return "";
    const d = JSON.parse(raw);
    return (d && d.sessao) ? String(d.sessao) : "";
  } catch { return ""; }
}

// Mensagens de erro amigáveis (o backend devolve códigos curtos no campo "error").
const MSG_ERRO = {
  nao_autenticado: "Sua sessão expirou. Saia e entre de novo pelo Portal.",
  sem_permissao: "Você só pode alterar imóveis captados por você.",
  so_pode_criar_em_seu_nome: "O imóvel precisa ser cadastrado em seu nome.",
  nao_pode_trocar_dono: "Você não pode transferir o imóvel para outro captador.",
  imovel_nao_encontrado: "Imóvel não encontrado.",
  firestore_indisponivel: "Servidor temporariamente indisponível. Tente novamente.",
};

async function chamarBackend(rota, corpo) {
  const token = tokenSessaoSSO();
  if (!token) throw new Error("Sessão não encontrada. Saia e entre de novo pelo Portal.");
  let r;
  try {
    r = await fetch(BACKEND_URL + rota, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify(corpo),
    });
  } catch {
    throw new Error("Falha de conexão com o servidor. Tente de novo em instantes.");
  }
  let j = null;
  try { j = await r.json(); } catch { j = null; }
  if (r.ok && j && j.ok) return j;
  const err = (j && j.error) || ("http_" + r.status);
  throw new Error(MSG_ERRO[err] || ("Erro (" + err + ")."));
}

// Cria um imóvel novo. Retorna o id criado.
export async function criarImovelBackend(data) {
  const j = await chamarBackend("/estoque/imovel/criar", { data });
  return j.id;
}

// Edita um imóvel existente. Retorna o id.
export async function editarImovelBackend(id, data) {
  const j = await chamarBackend("/estoque/imovel/editar", { id, data });
  return j.id || id;
}

// Exclui um imóvel. Retorna true.
export async function excluirImovelBackend(id) {
  await chamarBackend("/estoque/imovel/excluir", { id });
  return true;
}
