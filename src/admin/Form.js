import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase";
import {
  TRANSACOES, ESTADOS_IMOVEL, STATUS_IMOVEL, VISIBILIDADE_IMOVEL, CONDICOES, CANAIS, emptyForm
} from "../constants";
import { useImoveis, useTipos } from "../shared/hooks";
import { useUserRole, usuarioSSO, ehDiretorEfetivo } from "../shared/userRole";
import {
  formatBRL, formatTel, gerarDescricao, uploadToCloudinary, buscarCEP,
  ehTerreno, ehConstrucao, tipoEhLotePorNome, geocodificarEndereco, gerarCodigoImovel, reservarCodigoImovel
} from "../shared/utils";
import { btnPrimary, inputBase, sectionBox, pageWrap } from "../shared/styles";
import FotosGrid from "../shared/FotosGrid";
import PreviaQualidade from "./PreviaQualidade";

const CANAIS_AUTO = ["Canal Pro", "Chaves na Mão", "Catálogo Meta"];

const MIGRAR_CANAIS = {
  "Whatsapp": "WhatsApp Status",
  "Grupos": "WhatsApp Grupos",
  "Google Business": "Google Posts",
  "Instagram": "Instagram Post",
  "Marketplace Facebook": "Marketplace Facebook",
};

// Tipos que SAO "em condominio" (viraram tipos proprios). O nome do condominio
// e o valor do condominio passam a depender do TIPO escolhido, nao mais de uma flag.
const TIPOS_EM_CONDOMINIO = [
  "Casa em Condomínio",
  "Sobrado em Condomínio",
  "Lote em Condomínio",
  "Chácara em Condomínio",
];
function ehEmCondominio(tipo) {
  return TIPOS_EM_CONDOMINIO.includes(String(tipo || "").trim());
}

// Backend Railway (mesmo motor de visão que organiza as fotos na captação).
const BACKEND_URL = "https://agentes-de-whatsapp-production.up.railway.app";

// Token de sessão do Portal (gravado em admin_sso.sessao pelo App ao resgatar o SSO).
// É o que o backend valida pra saber quem é o usuário e seu papel (diretor/corretor).
function tokenSessaoSSO() {
  try {
    const raw = localStorage.getItem("admin_sso");
    if (!raw) return "";
    const d = JSON.parse(raw);
    return (d && d.sessao) ? String(d.sessao) : "";
  } catch { return ""; }
}

// Salva o imóvel PELO BACKEND (rotas protegidas). O backend confere papel/dono
// e grava no Firestore. Mantém toda a lógica de validação/código/geocoding aqui no front.
// Retorna o id do imóvel salvo. Lança erro (com mensagem amigável) se falhar.
async function salvarImovelBackend(idImovel, data) {
  const token = tokenSessaoSSO();
  if (!token) throw new Error("Sessão não encontrada. Saia e entre de novo pelo Portal.");
  const url = BACKEND_URL + (idImovel ? "/estoque/imovel/editar" : "/estoque/imovel/criar");
  const body = idImovel ? { id: idImovel, data } : { data };
  let r;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error("Falha de conexão com o servidor. Tente de novo em instantes.");
  }
  let j = null;
  try { j = await r.json(); } catch { j = null; }
  if (r.ok && j && j.ok) return j.id || idImovel;
  const err = (j && j.error) || ("http_" + r.status);
  const amigaveis = {
    nao_autenticado: "Sua sessão expirou. Saia e entre de novo pelo Portal.",
    sem_permissao: "Você só pode editar imóveis captados por você.",
    so_pode_criar_em_seu_nome: "O imóvel precisa ser cadastrado em seu nome.",
    nao_pode_trocar_dono: "Você não pode transferir o imóvel para outro captador.",
    imovel_nao_encontrado: "Imóvel não encontrado.",
    firestore_indisponivel: "Servidor temporariamente indisponível. Tente novamente.",
  };
  throw new Error(amigaveis[err] || ("Erro ao salvar (" + err + ")."));
}

// Imóveis vindos da captação podem ter "extras" como array (a IA às vezes devolve
// uma lista). O formulário e a prévia esperam TEXTO (uma característica por linha) e
// chamam .trim()/.split() — então normalizamos pra string ao carregar, senão a tela quebra.
function extrasParaTexto(v) {
  if (Array.isArray(v)) return v.filter(Boolean).join("\n");
  if (v == null) return "";
  return String(v);
}

export default function Form() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { imoveis, loading } = useImoveis();
  const { tipos } = useTipos();
  const { user, perfil, isAdmin, loading: loadingRole } = useUserRole();
  const [form, setForm] = useState(emptyForm);
  const [hydrated, setHydrated] = useState(!id);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [organizando, setOrganizando] = useState(false);
  // Toggle "Internacional" por campo de telefone (proprietário e captador).
  // Inicializa ligado se o valor já salvo começar com "+".
  const [telProprietarioIntl, setTelProprietarioIntl] = useState(false);
  const [telCaptadorIntl, setTelCaptadorIntl] = useState(false);
  const fileRef = useRef();

  function migrarAnuncios(anuncios) {
    if (!anuncios) return {};
    const novo = { ...anuncios };
    for (const [antigo, novoNome] of Object.entries(MIGRAR_CANAIS)) {
      if (novo[antigo] && !novo[novoNome]) {
        novo[novoNome] = novo[antigo];
        delete novo[antigo];
      }
    }
    return novo;
  }

  useEffect(() => {
    if (!id) return;
    if (loading) return;
    const existing = imoveis.find(i => i.id === id);
    if (!existing) {
      if (imoveis.length > 0) { alert("Imóvel não encontrado."); navigate("/admin"); }
      return;
    }
    // Permissão de edição: só o DONO (captadorEmail) ou DIRETOR pode editar.
    // Bloqueia corretor/gerente que tente abrir /admin/editar/:id de imóvel de outro pela URL.
    const meuEmail = (usuarioSSO() || "").toLowerCase();
    const dono = String(existing.captadorEmail || "").toLowerCase();
    const souDono = !!meuEmail && !!dono && meuEmail === dono;
    const ehDiretor = ehDiretorEfetivo(isAdmin);
    if (!souDono && !ehDiretor) {
      // O papel via Firebase pode ainda estar carregando — espera antes de bloquear,
      // pra nunca barrar um diretor por engano (falso negativo).
      if (loadingRole) return;
      alert("Você só pode editar imóveis captados por você.");
      navigate("/admin");
      return;
    }
    // Liberado (dono ou diretor) — carrega o imóvel no formulário.
    setForm({ ...emptyForm, ...existing, extras: extrasParaTexto(existing.extras), anuncios: migrarAnuncios(existing.anuncios) });
    setTelProprietarioIntl((existing.telefoneProprietario || "").trim().startsWith("+"));
    setTelCaptadorIntl((existing.telefoneCaptador || "").trim().startsWith("+"));
    setHydrated(true);
  }, [id, imoveis, loading, loadingRole, isAdmin, navigate]);

  // Imóvel NOVO: pré-preenche captador com os dados de quem está logado.
  // O dono é marcado por captadorEmail (vem do Portal/SSO) — funciona pro diretor e corretores.
  // O perfil do Firebase (useUserRole) é usado como complemento se existir (nome/telefone).
  useEffect(() => {
    if (id) return;            // só para imóvel novo
    const email = usuarioSSO();
    setForm(p => {
      if (p.captadorEmail) return p; // já preenchido (não sobrescreve)
      return {
        ...p,
        nomeCaptador: p.nomeCaptador || perfil?.nome || "",
        telefoneCaptador: p.telefoneCaptador || perfil?.telefone || "",
        captadorEmail: email || "",
        captadorUid: user?.uid || "",
      };
    });
    if ((perfil?.telefone || "").trim().startsWith("+")) setTelCaptadorIntl(true);
  }, [id, perfil, user]);

  // isLote por comportamento OU por nome (pega "Lote em Condomínio", "Lote Comercial",
  // "Área Comercial" etc. mesmo se o comportamento no cadastro estiver errado/vazio).
  const isLote = ehTerreno(form.tipo, tipos) || tipoEhLotePorNome(form.tipo);
  const isConstrucao = ehConstrucao(form.tipo, tipos) && !isLote;
  // Tipos rurais têm casa E terreno -> mostram os dois grupos de campos.
  const isRural = /ch[áa]cara|s[íi]tio|fazenda|rancho|haras/i.test(form.tipo || "");
  const isLocacao = form.transacao === "Locação";
  const isVenda = form.transacao === "Venda" || form.transacao === "Venda e Locação";
  const emCondominio = ehEmCondominio(form.tipo);
  const temCondominio = emCondominio || form.tipo === "Apartamento"; // apartamento ja e condominio

  const sf = (key, val) => setForm(p => ({ ...p, [key]: val }));
  const valorFinalLoc = () => (parseFloat(form.valorAluguel) || 0) + (parseFloat(form.valorCondominio) || 0) + (parseFloat(form.valorIPTU) || 0) || "";
  const toggleCondicao = (c) =>
    setForm(p => ({ ...p, condicoes: p.condicoes?.includes(c) ? p.condicoes.filter(x => x !== c) : [...(p.condicoes || []), c] }));
  const toggleAnuncio = (canal) => {
    const atual = form.anuncios?.[canal];
    const isAuto = CANAIS_AUTO.includes(canal);
    // estado atual "ligado": canal automático publica por padrão (a menos que ativo:false)
    const ligado = isAuto ? (atual ? atual.ativo !== false : true) : !!(atual && atual.ativo);
    const data = new Date().toLocaleDateString("pt-BR");
    // desligar canal automático grava opt-out explícito (ativo:false), não null
    const novo = ligado ? (isAuto ? { ativo: false, data } : null) : { ativo: true, data };
    setForm(p => ({ ...p, anuncios: { ...p.anuncios, [canal]: novo } }));
  };

  // Validação de telefone (proprietário e captador são obrigatórios).
  // Modo nacional: aceita 10 dígitos (fixo) ou 11 (celular: 3º dígito = 9).
  // Modo internacional: aceita qualquer número iniciado por "+" com 8+ caracteres
  // (mesmo critério do cadastro de tratativas do CRM).
  const telefoneValido = (value, intl) => {
    if (intl) return (value || "").trim().startsWith("+") && (value || "").trim().length >= 8;
    const d = (value || "").replace(/\D/g, "");
    if (d.length === 10) return true;            // fixo (DDD + 8)
    if (d.length === 11 && d[2] === "9") return true; // celular (DDD + 9 + 8)
    return false;
  };

  // Geocoding silencioso -- chamado automaticamente ao mudar cidade/bairro
  const geocodingSilencioso = async (cidade, bairro, estado, endereco, cep) => {
    if (!cidade) return;
    const coords = await geocodificarEndereco({ endereco, bairro, cidade, estado, cep });
    if (coords) setForm(p => ({ ...p, latitude: coords.latitude, longitude: coords.longitude }));
  };

  const save = async () => {
    if (!form.titulo) return alert("Preencha o título.");
    if (!telefoneValido(form.telefoneProprietario, telProprietarioIntl))
      return alert("Informe o telefone do proprietário: nacional (fixo 10 dígitos ou celular 11) ou internacional (com + e código do país).");
    if (!telefoneValido(form.telefoneCaptador, telCaptadorIntl))
      return alert("Informe o telefone do captador: nacional (fixo 10 dígitos ou celular 11) ou internacional (com + e código do país).");
    setSaving(true);
    try {
      const { id: _id, ...data } = form;
      // Tipos "em condominio" sao tipos proprios; a flag antiga nao e mais usada.
      // Garante coerencia: tipo de condominio -> condominio=true; senao limpa a flag.
      data.condominio = ehEmCondominio(data.tipo) || data.tipo === "Apartamento";
      if (!data.condominio) data.nomeCondominio = "";
      if (isLocacao) data.valorFinal = valorFinalLoc();
      if (!data.status) data.status = "Disponível";

      // Ágio: se marcado, garante a linha "Ágio / assumir financiamento" nos extras
      // (mesmo texto/padrão que o backend usa na captação). Se desmarcado, remove a linha.
      {
        const LINHA_AGIO = "Ágio / assumir financiamento";
        let linhasExtras = String(data.extras || "").split("\n").map(x => x.trim()).filter(Boolean)
          .filter(l => l.toLowerCase() !== LINHA_AGIO.toLowerCase());
        if (data._agio) linhasExtras.unshift(LINHA_AGIO);
        data.extras = linhasExtras.join("\n");
      }

      // ── Campos obrigatórios para PUBLICAR (ativar) a ficha ──
      // Faltando qualquer um, o imóvel é salvo mas fica "Aguardando Finalização"
      // (não entra no ar). O usuário pode completar depois.
      const faltando = [];
      if (!(data.nomeProprietario || "").trim()) faltando.push("dados do proprietário");
      if (!(data.telefoneProprietario || "").trim()) faltando.push("telefone do proprietário");
      if (!(data.descricao || "").trim()) faltando.push("descrição");
      if (!(String(data.preco || "")).trim()) faltando.push("valor");
      if (!(data.cidade || "").trim() || !(data.bairro || "").trim()) faltando.push("localização");
      if (!(data.endereco || "").trim()) faltando.push("endereço");
      if (!Array.isArray(data.fotos) || data.fotos.length === 0) faltando.push("fotos");
      // Metragem respeita o tipo: lote/terreno usa metragemTotal; construção usa metragem;
      // rural (tem os dois) aceita qualquer um dos dois. (Antes exigia sempre "metragem",
      // o que rebaixava todo lote pra "Aguardando finalização" ao reeditar.)
      const temMetragemConstrucao = !!(String(data.metragem || "")).trim();
      const temMetragemTerreno = !!(String(data.metragemTotal || "")).trim();
      if (isRural) {
        if (!temMetragemConstrucao && !temMetragemTerreno) faltando.push("metragem");
      } else if (isLote) {
        if (!temMetragemTerreno) faltando.push("metragem do terreno");
      } else {
        if (!temMetragemConstrucao) faltando.push("metragem");
      }
      if (!(data.titulo || "").trim()) faltando.push("título");
      if (!(data.tipo || "").trim()) faltando.push("tipo de imóvel");
      if (!(data.transacao || "").trim()) faltando.push("tipo de transação");
      if (!(data.estadoImovel || "").trim()) faltando.push("estado do imóvel");
      if (!(data.visibilidade || "").trim()) faltando.push("visibilidade");

      if (faltando.length > 0) {
        data.status = "Aguardando finalização";
        data.faltandoFinalizar = faltando; // guarda o que falta, pra mostrar na ficha
        // Avisa o usuário o que falta e deixa ELE decidir se salva incompleto
        // (fica "Aguardando finalização") ou volta pra completar agora.
        const lista = faltando.map(f => "• " + f).join("\n");
        const querSalvar = window.confirm(
          "Este imóvel NÃO vai ao ar porque faltam campos obrigatórios:\n\n" + lista +
          "\n\nClique OK para salvar mesmo assim (fica \"Aguardando finalização\")," +
          "\nou Cancelar para voltar e completar agora."
        );
        if (!querSalvar) { setSaving(false); return; }
      } else {
        data.faltandoFinalizar = [];
      }

      // Código automático: se ainda não tem código e há bairro, reserva o próximo
      // do contador persistente (atômico, nunca repete). Imóveis que já têm código mantêm.
      if (!(data.codigo || "").trim() && (data.bairro || "").trim()) {
        data.codigo = await reservarCodigoImovel(db, data.bairro);
      }
      // Geocoding automatico ao salvar se ainda nao tem coordenadas
      if (!data.latitude && !data.longitude && data.cidade) {
        const coords = await geocodificarEndereco({
          endereco: data.endereco, bairro: data.bairro,
          cidade: data.cidade, estado: data.estado, cep: data.cep,
        });
        if (coords) { data.latitude = coords.latitude; data.longitude = coords.longitude; }
      }
      // Grava PELO BACKEND (rota protegida): o servidor confere papel/dono e escreve no Firestore.
      // (O createdAt do imóvel novo é definido pelo backend.)
      await salvarImovelBackend(id, data);
      navigate("/admin");
    } catch (e) { alert("Erro: " + e.message); }
    setSaving(false);
  };

  const addFotos = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    setUploading(true);
    try {
      const urls = await Promise.all(files.map(f => uploadToCloudinary(f)));
      setForm(p => ({ ...p, fotos: [...(p.fotos || []), ...urls] }));
    } catch (err) { alert("Erro upload: " + err.message); }
    setUploading(false);
    e.target.value = "";
  };

  // Organiza as fotos com IA: melhor foto como capa + da segunda em diante um
  // passeio lógico pelo imóvel. Usa o mesmo motor de visão do backend (Railway),
  // que já faz isso na captação. Nenhuma foto é perdida — só reordenadas.
  const organizarFotosIA = async () => {
    const fotos = (form.fotos || []).filter(Boolean);
    if (fotos.length < 2) return;
    setOrganizando(true);
    try {
      const r = await fetch(BACKEND_URL + "/estoque/ordenar-fotos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fotos }),
      });
      const d = await r.json();
      if (d && d.ok && Array.isArray(d.fotos) && d.fotos.length === fotos.length) {
        sf("fotos", d.fotos);
      } else {
        alert("Não consegui organizar as fotos agora. Tente novamente em instantes.");
      }
    } catch (e) {
      alert("Erro ao organizar fotos: " + e.message);
    }
    setOrganizando(false);
  };

  const inp = (label, key, opts = {}) => (
    <div style={{ marginBottom: "1rem" }}>
      <label style={labelStyle}>{label}</label>
      <input type={opts.type || "text"} value={form[key] || ""} onChange={e => sf(key, e.target.value)} placeholder={opts.ph || ""} style={inputBase} />
    </div>
  );
  const inpTel = (label, key, intl, setIntl) => {
    const val = form[key] || "";
    const invalido = val.trim() !== "" && !telefoneValido(val, intl);
    return (
      <div style={{ marginBottom: "1rem" }}>
        <label style={labelStyle}>
          {label}
          <label style={{ marginLeft: 12, fontSize: 11, fontWeight: 400, color: "var(--text-muted)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={intl} onChange={() => { setIntl(n => !n); sf(key, ""); }} style={{ width: "auto", margin: 0 }} />
            Internacional
          </label>
        </label>
        <input type="tel" value={val}
          onChange={e => sf(key, intl ? e.target.value.replace(/[^\d+\s()-]/g, "") : formatTel(e.target.value))}
          placeholder={intl ? "+1 555 000 0000" : "(62) 9 9999-9999"}
          inputMode={intl ? "text" : "numeric"}
          style={{ ...inputBase, ...(invalido ? { borderColor: "#c0392b" } : {}) }} />
        {invalido && <p style={{ margin: "4px 0 0", fontSize: 11, color: "#c0392b" }}>{intl ? "Número internacional inválido. Use o formato +código número." : "Número incompleto. Use fixo (10 dígitos) ou celular (11 dígitos com 9)."}</p>}
      </div>
    );
  };
  const tog = (label, key) => (
    <label style={togStyle}>
      <input type="checkbox" checked={!!form[key]} onChange={e => sf(key, e.target.checked)} style={cbStyle} />{label}
    </label>
  );
  const sel = (label, key, opts) => (
    <div style={{ marginBottom: "1rem" }}>
      <label style={labelStyle}>{label}</label>
      <select value={form[key] || opts[0]} onChange={e => sf(key, e.target.value)} style={inputBase}>
        {opts.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
  const section = (title, children) => (
    <div style={sectionBox}>
      <p style={{ margin: "0 0 12px", fontWeight: 500, fontSize: 14, color: "var(--primary-dark)" }}>{title}</p>
      {children}
    </div>
  );

  return (
    <div style={pageWrap(1040)}>
      <style>{`@media (max-width:1024px){.previa-col{position:static !important;flex-basis:100% !important;}}`}</style>
      <div style={{ marginBottom: "1.5rem" }}>
        <button onClick={() => navigate(-1)} style={backBtn}>{"←"} Cancelar</button>
      </div>
      <h2 style={{ margin: "0 0 1.5rem", fontSize: 20, fontWeight: 500, color: "var(--primary-dark)" }}>
        {id ? "Editar imóvel" : "Novo imóvel"}
      </h2>

      {id && !hydrated && (
        <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem 0" }}>Carregando dados do imóvel...</p>
      )}
      {(!id || hydrated) && (<div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 600px", minWidth: 0 }}>

      {section("Informações gerais", <>
        {inp("Título *", "titulo", { ph: "Ex: Casa 3 quartos Setor Sul" })}

        {/* Código do imóvel: editável. Em branco = gerado automaticamente pelo bairro ao salvar. */}
        <div style={{ marginBottom: "1rem" }}>
          <label style={labelStyle}>Código do imóvel</label>
          <input
            value={form.codigo || ""}
            onChange={e => sf("codigo", e.target.value)}
            placeholder={form.bairro ? `Em branco gera: ${gerarCodigoImovel(form.bairro, imoveis, id)}` : "Em branco gera automaticamente pelo bairro"}
            style={inputBase} />
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
            Deixe <b>em branco</b> para gerar automaticamente pelo bairro ao salvar (nunca repete). Ou digite um código manual.
          </p>
        </div>

        <div style={grid2}>
          <div style={{ marginBottom: "1rem" }}>
            <label style={labelStyle}>Tipo de imóvel</label>
            <select value={form.tipo || tipos[0]?.nome} onChange={e => sf("tipo", e.target.value)} style={{ ...inputBase }}>
              {tipos.map(t => <option key={t.nome}>{t.nome}</option>)}
            </select>
          </div>
          {sel("Tipo de transação", "transacao", TRANSACOES)}
          {sel("Estado do imóvel", "estadoImovel", ESTADOS_IMOVEL)}
          {sel("Status", "status", STATUS_IMOVEL)}
          {sel("Visibilidade", "visibilidade", VISIBILIDADE_IMOVEL)}
        </div>

        {/* Atalhos rápidos de status (marcam o campo Status acima) */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 1rem" }}>
          {[
            ["✅ Disponível", "Disponível", "#059669"],
            ["🏷️ Vendido", "Vendido", "#dc2626"],
            ["🔑 Alugado", "Alugado", "#7c3aed"],
            ["⏸️ Reservado", "Reservado", "#d97706"],
            ["⏳ Aguardando", "Aguardando finalização", "#0891b2"],
          ].map(([rotulo, valor, cor]) => {
            const ativo = form.status === valor;
            return (
              <button key={valor} type="button" onClick={() => sf("status", valor)}
                style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  border: `1.5px solid ${ativo ? cor : "#d1d5db"}`,
                  background: ativo ? cor : "transparent",
                  color: ativo ? "#fff" : "var(--text-muted)" }}>
                {rotulo}
              </button>
            );
          })}
        </div>

        {/* Rodízio automático: tira o imóvel dos disparos automáticos (grupos de corretores + Instagram).
            Continua disponível e visível normalmente; só não entra na divulgação automática. */}
        <div style={{ margin: "0 0 1rem", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-muted)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer", color: "var(--text)" }}>
            <input type="checkbox" checked={!!form.foraRodizio} onChange={e => sf("foraRodizio", e.target.checked)} style={cbStyle} />
            {"🚫"} Não incluir no rodízio automático
          </label>
          <p style={{ margin: "6px 0 0 24px", fontSize: 11, color: "var(--text-muted)" }}>
            O imóvel continua disponível e visível normalmente, mas fica de fora dos disparos automáticos para os grupos de corretores e das publicações automáticas no Instagram.
          </p>
        </div>

        {(!isLote || isRural) && inp("Metragem de construção (m²)", "metragem", { type: "number" })}
        {inp("Metragem total do terreno (m²)", "metragemTotal", { type: "number" })}
        {temCondominio && inp("Nome do condomínio", "nomeCondominio")}
      </>)}

      {!isLocacao && section("Condições comerciais", <>
        {CONDICOES.map(c => (
          <div key={c}>
            <label style={togStyle}>
              <input type="checkbox" checked={form.condicoes?.includes(c) || false} onChange={() => toggleCondicao(c)} style={cbStyle} />{c}
            </label>
            {c === "Permuta" && form.condicoes?.includes("Permuta") && (
              <input value={form.permuta || ""} onChange={e => sf("permuta", e.target.value)} placeholder="Descreva o que aceita em permuta..."
                style={{ ...inputBase, fontSize: 13, marginBottom: 8 }} />
            )}
          </div>
        ))}
      </>)}

      {section("Fotos", <>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={addFotos} style={{ display: "none" }} />
        <button onClick={() => fileRef.current.click()} disabled={uploading}
          style={{ padding: "9px 18px", borderRadius: 8, border: "1px dashed var(--border-soft)", background: uploading ? "var(--bg-muted)" : "var(--bg-input)", color: "var(--text)", cursor: uploading ? "default" : "pointer", fontSize: 13, marginBottom: 12 }}>
          {uploading ? "Enviando fotos..." : "+ Adicionar fotos"}
        </button>
        {(form.fotos || []).length >= 2 && (
          <button onClick={organizarFotosIA} disabled={organizando || uploading}
            style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid var(--primary)", background: (organizando || uploading) ? "var(--bg-muted)" : "var(--primary-light)", color: "var(--primary)", cursor: (organizando || uploading) ? "default" : "pointer", fontSize: 13, marginBottom: 12, marginLeft: 8 }}>
            {organizando ? "Organizando com IA..." : "✨ Organizar fotos com IA"}
          </button>
        )}
        {organizando && <p style={{ margin: "0 0 12px", fontSize: 11, color: "var(--text-muted)" }}>A IA está olhando as fotos e definindo a melhor ordem (capa + passeio lógico)...</p>}
        <FotosGrid fotos={form.fotos || []} onChange={fs => sf("fotos", fs)} onRemove={i => sf("fotos", form.fotos.filter((_, idx) => idx !== i))} />
      </>)}

      {section("Localização", <>
        <div style={{ marginBottom: "1rem" }}>
          <label style={labelStyle}>CEP</label>
          <input value={form.cep || ""} onChange={e => {
            sf("cep", e.target.value);
            buscarCEP(e.target.value, (data) => {
              const cidade = data.localidade || form.cidade;
              const bairro = data.bairro || form.bairro;
              const estado = data.uf || form.estado;
              const endereco = [data.logradouro, data.complemento].filter(Boolean).join(", ") || form.endereco;
              setForm(p => ({ ...p, endereco, bairro, cidade, estado }));
              geocodingSilencioso(cidade, bairro, estado, endereco, e.target.value);
            });
          }} placeholder="Ex: 74000000" maxLength={8} style={inputBase} />
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>Digite o CEP (somente números) para preencher automaticamente.</p>
        </div>
        <div style={grid2}>
          <div style={{ marginBottom: "1rem" }}>
            <label style={labelStyle}>Cidade</label>
            <input value={form.cidade || ""} onChange={e => {
              sf("cidade", e.target.value);
              geocodingSilencioso(e.target.value, form.bairro, form.estado, form.endereco, form.cep);
            }} placeholder="Ex: Goiânia" style={inputBase} />
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label style={labelStyle}>Estado (UF)</label>
            <input value={form.estado || ""} onChange={e => sf("estado", e.target.value.toUpperCase().slice(0, 2))}
              placeholder="GO" maxLength={2} style={inputBase} />
          </div>
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <label style={labelStyle}>Bairro</label>
          <input value={form.bairro || ""} onChange={e => {
            sf("bairro", e.target.value);
            geocodingSilencioso(form.cidade, e.target.value, form.estado, form.endereco, form.cep);
          }} placeholder="Ex: Setor Sul" style={inputBase} />
        </div>
        {inp("Endereço (visível só para admin)", "endereco", { ph: "Ex: Rua das Flores, 123" })}
        <div style={{ marginBottom: "1rem" }}>
          <label style={labelStyle}>Link do Google Maps</label>
          <input value={form.mapsLink || ""} onChange={e => sf("mapsLink", e.target.value)} placeholder="Cole aqui o link do Google Maps" style={inputBase} />
          {form.mapsLink && <a href={form.mapsLink} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "var(--primary)", textDecoration: "none" }}>Verificar link {"→"}</a>}
        </div>
        {(isLote || isRural) && <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>{tog("Asfalto", "asfalto")}{tog("Água", "agua")}{tog("Esgoto", "esgoto")}</div>}
      </>)}

      {(isLote || isRural) && section("Detalhes do terreno", <>
        {sel("Declive", "declive", ["Plano", "Lateral", "Fundo", "Frente"])}
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 8 }}>{tog("Muro", "muro")}{tog("Esquina", "esquina")}{tog("Retangular", "retangular")}</div>
        {form.retangular
          ? <div style={grid2}>{inp("Frente (m)", "frente", { type: "number" })}{inp("Laterais (m)", "laterais", { type: "number" })}</div>
          : inp("Medidas", "medidas", { ph: "Ex: 15x30 irregular" })}
      </>)}

      {(isConstrucao || isRural) && section("Detalhes da construção", <>
        <div style={grid2}>
          {inp("Quartos", "quartos", { type: "number" })}
          {inp("Suítes", "suites", { type: "number" })}
          {inp("Garagens", "garagens", { type: "number" })}
          {inp("Banheiros", "banheiros", { type: "number" })}
          {inp("Valor de avaliação (R$)", "valorAvaliacao", { type: "number" })}
          {inp("Valor de entrada (R$)", "valorEntrada", { type: "number" })}
        </div>
      </>)}

      {isVenda && section("Valor de venda", <>
        <div style={grid2}>
          {inp("Preço de venda (R$)", "preco", { type: "number", ph: "Ex: 350000" })}
          {inp("IPTU (R$)", "valorIPTU", { type: "number" })}
          {temCondominio && inp("Valor do condomínio (R$)", "valorCondominio", { type: "number" })}
        </div>
      </>)}

      {isLocacao && section("Valores de locação", <>
        <div style={grid2}>
          {inp("Aluguel (R$)", "valorAluguel", { type: "number" })}
          {inp("Condomínio (R$)", "valorCondominio", { type: "number" })}
          {inp("IPTU (R$)", "valorIPTU", { type: "number" })}
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--primary)", fontWeight: 500 }}>Total: {formatBRL(valorFinalLoc()) || "—"}</p>
      </>)}

      {section("Descrição", <>
        <div style={{ marginBottom: 12 }}>
          {tog("Imóvel de ágio (assumir financiamento)", "_agio")}
        </div>
        {form._agio && (
          <div style={{ marginBottom: 12, padding: 12, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-soft, #fafafa)" }}>
            <p style={{ margin: "0 0 10px", fontWeight: 500, fontSize: 13, color: "var(--primary-dark)" }}>Dados do ágio</p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 160px" }}>{inp("Valor da parcela (R$)", "agioParcela", { type: "number" })}</div>
              <div style={{ flex: "1 1 160px" }}>{inp("Prazo (meses p/ quitar)", "agioPrazo", { type: "number" })}</div>
              <div style={{ flex: "1 1 160px" }}>{inp("Saldo devedor (R$)", "agioSaldoDevedor", { type: "number" })}</div>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--primary)", fontWeight: 500 }}>
              Valor total (ágio + saldo): {formatBRL((parseFloat(form.preco) || 0) + (parseFloat(form.agioSaldoDevedor) || 0)) || "—"}
            </p>
          </div>
        )}
        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>Características extras (uma por linha)</label>
          <textarea value={form.extras || ""} onChange={e => sf("extras", e.target.value)} placeholder={"Ex:\nAr condicionado\nPiscina aquecida"} rows={3}
            style={{ ...inputBase, resize: "vertical", lineHeight: 1.6 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <label style={{ fontSize: 13, color: "var(--text-soft)" }}>Descrição completa (editável)</label>
          <button onClick={() => sf("descricao", gerarDescricao(form))}
            style={{ fontSize: 12, padding: "4px 12px", borderRadius: 7, border: "1px solid var(--primary)", background: "var(--primary-light)", color: "var(--primary)", cursor: "pointer" }}>
            Gerar automaticamente
          </button>
        </div>
        <textarea value={form.descricao || ""} onChange={e => sf("descricao", e.target.value)} placeholder="Clique em 'Gerar automaticamente' ou escreva manualmente..." rows={10}
          style={{ ...inputBase, resize: "vertical", lineHeight: 1.6 }} />
      </>)}

      {section("Proprietário (visível só para admin) *", <>
        <div style={grid2}>{inp("Nome", "nomeProprietario")}{inpTel("Telefone *", "telefoneProprietario", telProprietarioIntl, setTelProprietarioIntl)}</div>
      </>)}

      {section("Captador *", <>
        <div style={grid2}>{inp("Nome", "nomeCaptador")}{inpTel("Telefone *", "telefoneCaptador", telCaptadorIntl, setTelCaptadorIntl)}</div>
      </>)}

      {section("Onde foi anunciado (visível só para admin)", <>
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 10px" }}>
          {"⚙"} = integração automática via feed XML
        </p>
        {CANAIS.map(canal => {
          const info = form.anuncios?.[canal];
          const isAuto = CANAIS_AUTO.includes(canal);
          const ligado = isAuto ? (info ? info.ativo !== false : true) : !!(info && info.ativo);
          return (
            <div key={canal} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1 }}>
                <input type="checkbox" checked={ligado} onChange={() => toggleAnuncio(canal)} style={cbStyle} />
                <span style={{ fontSize: 14 }}>
                  {isAuto && <span style={{ fontSize: 11, color: "var(--primary)", marginRight: 4 }}>{"⚙"}</span>}
                  {canal}
                </span>
              </label>
              {ligado && info?.data && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{info.data}</span>}
            </div>
          );
        })}
      </>)}

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button onClick={() => navigate(-1)} style={{ flex: 1, padding: "11px 0", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer", fontSize: 14 }}>Cancelar</button>
        <button onClick={save} disabled={saving || uploading}
          style={{ ...btnPrimary, flex: 2, padding: "11px 0", background: (saving || uploading) ? "#aaa" : "var(--primary)", cursor: (saving || uploading) ? "default" : "pointer", fontSize: 14, fontWeight: 500 }}>
          {saving ? "Salvando..." : uploading ? "Aguarde o upload..." : "Salvar imóvel"}
        </button>
      </div>
      </div>{/* fim da coluna do formulário */}
      <div className="previa-col" style={{ flex: "0 0 320px", position: "sticky", top: 16, alignSelf: "flex-start", maxWidth: "100%" }}>
        <PreviaQualidade form={form} isLote={isLote} />
      </div>
      </div>)}
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 13, color: "var(--text-soft)", marginBottom: 4 };
const togStyle = { display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer", marginBottom: 8, color: "var(--text)" };
const cbStyle = { width: 16, height: 16, accentColor: "var(--primary)" };
const grid2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const backBtn = { display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", fontSize: 15, cursor: "pointer", color: "var(--primary)", fontWeight: 500, padding: 0 };
