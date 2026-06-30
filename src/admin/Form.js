import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase";
import {
  TRANSACOES, ESTADOS_IMOVEL, CONDICOES, CANAIS, CANAIS_VENDA, emptyForm
} from "../constants";
import { useImoveis, useTipos } from "../shared/hooks";
import { useUserRole, usuarioSSO, ehDiretorEfetivo } from "../shared/userRole";
import {
  formatBRL, formatTel, gerarDescricao, uploadToCloudinary, buscarCEP,
  ehTerreno, ehConstrucao, tipoEhLotePorNome, geocodificarEndereco, gerarCodigoImovel, reservarCodigoImovel
} from "../shared/utils";
import { btnPrimary } from "../shared/styles";
import { LOGO_URL } from "../constants";
import FotosGrid from "../shared/FotosGrid";
import MapaPino from "../shared/MapaPino";
import PreviaQualidade from "./PreviaQualidade";

const CANAIS_AUTO = ["Canal Pro", "Chaves na Mão", "Catálogo Meta"];

const MIGRAR_CANAIS = {
  "Whatsapp": "WhatsApp Status",
  "Grupos": "WhatsApp Grupos",
  "Google Business": "Google Posts",
  "Instagram": "Instagram Post",
  "Marketplace Facebook": "Marketplace Facebook",
};

const TIPOS_EM_CONDOMINIO = [
  "Casa em Condomínio",
  "Sobrado em Condomínio",
  "Lote em Condomínio",
  "Chácara em Condomínio",
];
function ehEmCondominio(tipo) {
  return TIPOS_EM_CONDOMINIO.includes(String(tipo || "").trim());
}

const BACKEND_URL = "https://agentes-de-whatsapp-production.up.railway.app";

function tokenSessaoSSO() {
  try {
    const raw = localStorage.getItem("admin_sso");
    if (!raw) return "";
    const d = JSON.parse(raw);
    return (d && d.sessao) ? String(d.sessao) : "";
  } catch { return ""; }
}

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
  const [importandoDrive, setImportandoDrive] = useState(false);
  const [urlDrive, setUrlDrive] = useState('');
  const [previaFoto, setPreviaFoto] = useState(null);
  const [telProprietarioIntl, setTelProprietarioIntl] = useState(false);
  const [mostrarCanais, setMostrarCanais] = useState(false);
  const [modalPublicar, setModalPublicar] = useState(false);
  const [modalConfirmar, setModalConfirmar] = useState(false);
  // Lista de captadores cadastrados no Supabase (via backend)
  const [listaCaptadores, setListaCaptadores] = useState([]);
  const fileRef = useRef();

  // Carrega lista de captadores do Supabase via backend
  useEffect(() => {
    const token = tokenSessaoSSO();
    if (!token) return;
    fetch(BACKEND_URL + '/captadores/listar', {
      headers: { 'Authorization': 'Bearer ' + token }
    })
      .then(r => r.json())
      .then(j => { if (j.ok) setListaCaptadores(j.captadores || []); })
      .catch(() => {});
  }, []);

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
    const meuEmail = (usuarioSSO() || "").toLowerCase();
    const dono = String(existing.captadorEmail || "").toLowerCase();
    const souDono = !!meuEmail && !!dono && meuEmail === dono;
    const ehDiretor = ehDiretorEfetivo(isAdmin);
    if (!souDono && !ehDiretor) {
      if (loadingRole) return;
      alert("Você só pode editar imóveis captados por você.");
      navigate("/admin");
      return;
    }
    setForm({ ...emptyForm, ...existing, extras: extrasParaTexto(existing.extras), anuncios: migrarAnuncios(existing.anuncios) });
    setTelProprietarioIntl((existing.telefoneProprietario || "").trim().startsWith("+"));
    setHydrated(true);
  }, [id, imoveis, loading, loadingRole, isAdmin, navigate]);

  useEffect(() => {
    if (id) return;
    const email = usuarioSSO();
    setForm(p => {
      if (p.captadorEmail) return p;
      return {
        ...p,
        nomeCaptador: p.nomeCaptador || perfil?.nome || "",
        telefoneCaptador: p.telefoneCaptador || perfil?.telefone || "",
        captadorEmail: email || "",
        captadorUid: user?.uid || "",
      };
    });
  }, [id, perfil, user]);

  const isLote = ehTerreno(form.tipo, tipos) || tipoEhLotePorNome(form.tipo);
  const isConstrucao = ehConstrucao(form.tipo, tipos) && !isLote;
  const isRural = /ch[áa]cara|s[íi]tio|fazenda|rancho|haras/i.test(form.tipo || "");
  const isLocacao = form.transacao === "Locação";
  const isVenda = form.transacao === "Venda" || form.transacao === "Venda e Locação";
  const emCondominio = ehEmCondominio(form.tipo);
  const temCondominio = emCondominio || form.tipo === "Apartamento";

  const sf = (key, val) => setForm(p => ({ ...p, [key]: val }));
  const valorFinalLoc = () => (parseFloat(form.valorAluguel) || 0) + (parseFloat(form.valorCondominio) || 0) + (parseFloat(form.valorIPTU) || 0) || "";
  const toggleCondicao = (c) =>
    setForm(p => ({ ...p, condicoes: p.condicoes?.includes(c) ? p.condicoes.filter(x => x !== c) : [...(p.condicoes || []), c] }));
  const toggleAnuncio = (canal) => {
    const atual = form.anuncios?.[canal];
    const isAuto = CANAIS_AUTO.includes(canal);
    const ligado = isAuto ? (atual ? atual.ativo !== false : true) : !!(atual && atual.ativo);
    const data = new Date().toLocaleDateString("pt-BR");
    const novo = ligado ? (isAuto ? { ativo: false, data } : null) : { ativo: true, data };
    setForm(p => ({ ...p, anuncios: { ...p.anuncios, [canal]: novo } }));
  };

  const telefoneValido = (value, intl) => {
    if (intl) return (value || "").trim().startsWith("+") && (value || "").trim().length >= 8;
    const d = (value || "").replace(/\D/g, "");
    if (d.length === 10) return true;
    if (d.length === 11 && d[2] === "9") return true;
    return false;
  };

  const geocodingSilencioso = async (cidade, bairro, estado, endereco, cep) => {
    if (!cidade) return;
    // Não sobrescreve coordenada ajustada manualmente
    if (form.coordManual) return;
    const coords = await geocodificarEndereco({ endereco, bairro, cidade, estado, cep });
    if (coords) setForm(p => ({ ...p, latitude: coords.latitude, longitude: coords.longitude }));
  };

  const save = async (overrides = {}) => {
    if (!form.titulo) return alert("Preencha o título.");
    if (!telefoneValido(form.telefoneProprietario, telProprietarioIntl))
      return alert("Informe o telefone do proprietário: nacional (fixo 10 dígitos ou celular 11) ou internacional (com + e código do país).");
    if (!form.nomeCaptador || !(form.captadores_ids || []).length)
      return alert("Selecione pelo menos um captador.");
    setSaving(true);
    try {
      const { id: _id, ...data } = { ...form, ...overrides };
      data.condominio = ehEmCondominio(data.tipo) || data.tipo === "Apartamento";
      if (!data.condominio) data.nomeCondominio = "";
      if (isLocacao) data.valorFinal = valorFinalLoc();
      if (!data.status) data.status = "Disponível";

      {
        const LINHA_AGIO = "Ágio / assumir financiamento";
        let linhasExtras = String(data.extras || "").split("\n").map(x => x.trim()).filter(Boolean)
          .filter(l => l.toLowerCase() !== LINHA_AGIO.toLowerCase());
        if (data._agio) linhasExtras.unshift(LINHA_AGIO);
        data.extras = linhasExtras.join("\n");
      }

      const faltando = [];
      if (!(data.nomeProprietario || "").trim()) faltando.push("dados do proprietário");
      if (!(data.telefoneProprietario || "").trim()) faltando.push("telefone do proprietário");
      if (!(data.descricao || "").trim()) faltando.push("descrição");
      if (isLocacao) {
        if (!(String(data.valorAluguel || "")).trim()) faltando.push("valor");
      } else {
        if (!(String(data.preco || "")).trim()) faltando.push("valor");
      }
      if (!(data.cidade || "").trim() || !(data.bairro || "").trim()) faltando.push("localização");
      if (!(data.endereco || "").trim()) faltando.push("endereço");
      if (!Array.isArray(data.fotos) || data.fotos.length === 0) faltando.push("fotos");
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
        data.faltandoFinalizar = faltando;
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

      if (!(data.codigo || "").trim() && (data.bairro || "").trim()) {
        data.codigo = await reservarCodigoImovel(db, data.bairro);
      }
      if (!data.coordManual && !data.latitude && !data.longitude && data.cidade) {
        const coords = await geocodificarEndereco({
          endereco: data.endereco, bairro: data.bairro,
          cidade: data.cidade, estado: data.estado, cep: data.cep,
        });
        if (coords) { data.latitude = coords.latitude; data.longitude = coords.longitude; }
      }
      await salvarImovelBackend(id, data);
      navigate("/admin");
    } catch (e) { alert("Erro: " + e.message); }
    setSaving(false);
  };

  const uploadFiles = async (files) => {
    if (!files.length) return;
    files.sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { numeric: true, sensitivity: "base" }));
    setUploading(true);
    try {
      const urls = await Promise.all(files.map(f => uploadToCloudinary(f)));
      setForm(p => ({ ...p, fotos: [...(p.fotos || []), ...urls] }));
    } catch (err) { alert("Erro upload: " + err.message); }
    setUploading(false);
  };

  const addFotos = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    await uploadFiles(files);
    e.target.value = "";
  };

  // ITEM 7: colar fotos com Ctrl+V (área de transferência) direto no cadastro.
  useEffect(() => {
    const onPaste = (e) => {
      const itens = Array.from(e.clipboardData?.items || []);
      const imgs = itens.filter(it => it.type && it.type.startsWith("image/")).map(it => it.getAsFile()).filter(Boolean);
      if (imgs.length) { e.preventDefault(); uploadFiles(imgs); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const importarDrive = async () => {
    const link = urlDrive.trim();
    if (!link) return alert("Cole o link da pasta do Google Drive.");
    if (!link.includes("drive.google.com")) return alert("O link deve ser do Google Drive.");
    setImportandoDrive(true);
    try {
      const r = await fetch(BACKEND_URL + "/estoque/importar-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + tokenSessaoSSO() },
        body: JSON.stringify({ url: link }),
      });
      const d = await r.json();
      if (d && d.ok && Array.isArray(d.fotos) && d.fotos.length) {
        setForm(p => ({ ...p, fotos: [...(p.fotos || []), ...d.fotos] }));
        setUrlDrive("");
        alert(`✅ ${d.total} foto(s) importada(s) do Drive!${d.erros ? ` (${d.erros} não importada(s))` : ""}`);
      } else {
        alert("Erro: " + (d && d.error ? d.error : "Não consegui importar as fotos."));
      }
    } catch (e) {
      alert("Erro ao importar: " + e.message);
    }
    setImportandoDrive(false);
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
    const valido = val.trim() !== "" && telefoneValido(val, intl);
    const waLink = valido ? (() => {
      const d = val.replace(/\D/g, "");
      const num = intl ? d : (d.startsWith("55") ? d : "55" + d);
      return "https://wa.me/" + num;
    })() : null;
    return (
      <div style={{ marginBottom: "1rem" }}>
        <label style={labelStyle}>
          {label}
          <label style={{ marginLeft: 12, fontSize: 11, fontWeight: 400, color: "var(--text-muted)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={intl} onChange={() => { setIntl(n => !n); sf(key, ""); }} style={{ width: "auto", margin: 0 }} />
            Internacional
          </label>
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <input type="tel" value={val}
            onChange={e => sf(key, intl ? e.target.value.replace(/[^\d+\s()-]/g, "") : formatTel(e.target.value))}
            placeholder={intl ? "+1 555 000 0000" : "(62) 9 9999-9999"}
            inputMode={intl ? "text" : "numeric"}
            style={{ ...inputBase, flex: 1, ...(invalido ? { borderColor: "#c0392b" } : {}) }} />
          {waLink && (
            <a href={waLink} target="_blank" rel="noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "9px 12px", background: "#25D366", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}>
              💬
            </a>
          )}
        </div>
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
      <p style={{ margin: "0 0 16px", fontWeight: 600, fontSize: 12, color: "var(--primary)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{title}</p>
      {children}
    </div>
  );

  // ── Publicação (status + onde aparece) ──────────────────────────────────
  // O campo "visibilidade" guarda 1 de 4 textos. Aqui traduzimos para 2 flags
  // simples (site / portais) que viram cards "ligados por padrão".
  const vis = form.visibilidade || "Site e portais";
  const noSite = vis !== "Ocultar do site" && vis !== "Ocultar de tudo";
  const noPortais = vis !== "Ocultar dos portais" && vis !== "Ocultar de tudo";
  const setVisibilidade = (site, portais) => {
    let v = "Site e portais";
    if (site && portais) v = "Site e portais";
    else if (site && !portais) v = "Ocultar dos portais";
    else if (!site && portais) v = "Ocultar do site";
    else v = "Ocultar de tudo";
    sf("visibilidade", v);
  };

  // Status disponíveis conforme a transação: Venda mostra "Vendido", Locação mostra "Alugado".
  const statusBotoes = (() => {
    const base = [
      ["✅ Disponível", "Disponível", "#059669"],
      ["⏳ Aguardando", "Aguardando finalização", "#0891b2"],
      ["⏸️ Reservado", "Reservado", "#d97706"],
    ];
    if (isVenda) base.push(["🏷️ Vendido", "Vendido", "#dc2626"]);
    if (isLocacao) base.push(["🔑 Alugado", "Alugado", "#7c3aed"]);
    return base;
  })();
  const exigeCanal = form.status === "Vendido" || form.status === "Alugado";

  // Card "onde aparece" — verde quando ligado, cinza quando desligado.
  const cardAparece = (titulo, sub, ligado, onToggle) => (
    <button type="button" onClick={onToggle}
      style={{ flex: "1 1 150px", textAlign: "left", padding: "12px 14px", borderRadius: 10, cursor: "pointer",
        border: `2px solid ${ligado ? "#059669" : "#d1d5db"}`,
        background: ligado ? "rgba(5,150,105,0.08)" : "var(--bg-muted)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: ligado ? "#059669" : "var(--text-muted)" }}>{titulo}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: ligado ? "#059669" : "#9ca3af" }}>{ligado ? "ON" : "OFF"}</span>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.4 }}>{sub}</div>
    </button>
  );

  // Bloco de publicação no rodapé (sempre visível, inclusive na edição).
  const blocoPublicacao = () => (
    <div style={{ ...sectionBox, marginBottom: "1.5rem", border: "1px solid var(--primary)", background: "var(--primary-light)" }}>
      <p style={{ margin: "0 0 4px", fontWeight: 600, fontSize: 16, color: "var(--primary-dark)" }}>Publicação</p>
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--text-soft)" }}>Defina a situação do imóvel e onde ele deve aparecer.</p>

      <label style={labelStyle}>Situação</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {statusBotoes.map(([rotulo, valor, cor]) => {
          const ativo = form.status === valor;
          return (
            <button key={valor} type="button" onClick={() => sf("status", valor)}
              style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                border: `1.5px solid ${ativo ? cor : "#d1d5db"}`,
                background: ativo ? cor : "transparent",
                color: ativo ? "#fff" : "var(--text-muted)" }}>
              {rotulo}
            </button>
          );
        })}
      </div>

      {exigeCanal && (
        <div style={{ marginBottom: 18, padding: "12px 14px", borderRadius: 10, border: "1px solid var(--primary)", background: "var(--bg-card)" }}>
          <label style={{ ...labelStyle, fontWeight: 600 }}>Por qual canal o imóvel foi {form.status === "Vendido" ? "vendido" : "alugado"}? *</label>
          <select value={form.canalVenda || ""} onChange={e => sf("canalVenda", e.target.value)} style={inputBase}>
            <option value="">Selecione o canal...</option>
            {CANAIS_VENDA.map(cv => <option key={cv} value={cv}>{cv}</option>)}
          </select>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>Registra de onde veio o cliente que fechou o negócio.</p>
        </div>
      )}

      <label style={labelStyle}>Onde este imóvel aparece <span style={{ fontSize: 11, color: "var(--text-muted)" }}>(clique para ligar/desligar)</span></label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        {cardAparece("🌐 Site", "Site inerente.com.br", noSite, () => setVisibilidade(!noSite, noPortais))}
        {cardAparece("🏢 Portais", "Canal Pro, Chaves, ZAP, Viva, OLX", noPortais, () => setVisibilidade(noSite, !noPortais))}
        {cardAparece("📱 Divulgação automática", "Grupos de WhatsApp e Instagram", !form.foraRodizio, () => sf("foraRodizio", !form.foraRodizio))}
      </div>

      <div style={{ borderTop: "1px solid var(--border-soft)", paddingTop: 14 }}>
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
    </div>
  );

  // Ao clicar em Salvar, decide o fluxo conforme a situação atual do imóvel.
  const onClickSalvar = () => {
    // Canal é obrigatório quando o imóvel foi vendido/alugado.
    if ((form.status === "Vendido" || form.status === "Alugado") && !(form.canalVenda || "").trim()) {
      alert("Selecione por qual canal o imóvel foi " + (form.status === "Vendido" ? "vendido" : "alugado") + ".");
      return;
    }
    if (form.status === "Aguardando finalização") { setModalPublicar(true); return; }
    if (form.status === "Disponível") { setModalConfirmar(true); return; }
    // Vendido / Reservado / Alugado: salva direto (não vão pros portais).
    save();
  };

  // Janela de publicação (só no cadastro novo) — atalho da primeira decisão.
  const modalPublicacao = () => {
    const publicarAgora = () => { setModalPublicar(false); save({ status: "Disponível" }); };
    const deixarAguardando = () => { setModalPublicar(false); save({ status: "Aguardando finalização" }); };
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
        <div style={{ background: "var(--bg-card)", borderRadius: 14, padding: "24px 22px", maxWidth: 440, width: "100%", boxShadow: "0 10px 40px rgba(0,0,0,0.25)" }}>
          <h3 style={{ margin: "0 0 6px", fontSize: 18, color: "var(--primary-dark)" }}>Publicar este imóvel?</h3>
          <p style={{ margin: "0 0 18px", fontSize: 13.5, color: "var(--text-soft)", lineHeight: 1.5 }}>
            Você pode publicar agora (fica <b>Disponível</b> e aparece nos canais ligados) ou deixar <b>Aguardando</b> para revisar depois.
          </p>

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Onde vai aparecer</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {cardAparece("🌐 Site", "Site inerente.com.br", noSite, () => setVisibilidade(!noSite, noPortais))}
              {cardAparece("🏢 Portais", "Canal Pro, ZAP, Viva, OLX", noPortais, () => setVisibilidade(noSite, !noPortais))}
              {cardAparece("📱 Divulgação", "WhatsApp e Instagram", !form.foraRodizio, () => sf("foraRodizio", !form.foraRodizio))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexDirection: "column" }}>
            <button onClick={publicarAgora} disabled={saving || uploading}
              style={{ ...btnPrimary, padding: "12px 0", fontSize: 15, fontWeight: 600 }}>
              {saving ? "Salvando..." : "✅ Publicar agora"}
            </button>
            <button onClick={deixarAguardando} disabled={saving || uploading}
              style={{ padding: "11px 0", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer", fontSize: 14 }}>
              ⏳ Deixar aguardando (não publicar ainda)
            </button>
            <button onClick={() => setModalPublicar(false)} disabled={saving || uploading}
              style={{ padding: "8px 0", border: "none", background: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 13 }}>
              Voltar e revisar
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Modal de confirmação ao salvar um imóvel que JÁ está ativo (Disponível).
  // Evita republicar/manter ativo sem querer.
  const modalConfirmacao = () => (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div style={{ background: "var(--bg-card)", borderRadius: 14, padding: "24px 22px", maxWidth: 440, width: "100%", boxShadow: "0 10px 40px rgba(0,0,0,0.25)" }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 18, color: "var(--primary-dark)" }}>Este imóvel está ATIVO</h3>
        <p style={{ margin: "0 0 18px", fontSize: 13.5, color: "var(--text-soft)", lineHeight: 1.5 }}>
          Ao salvar, ele continua <b>Disponível</b> e será publicado nos canais ligados (site e portais). Confirma que é para mantê-lo ativo?
        </p>
        <div style={{ display: "flex", gap: 10, flexDirection: "column" }}>
          <button onClick={() => { setModalConfirmar(false); save(); }} disabled={saving || uploading}
            style={{ ...btnPrimary, padding: "12px 0", fontSize: 15, fontWeight: 600 }}>
            {saving ? "Salvando..." : "✅ Sim, manter ativo e salvar"}
          </button>
          <button onClick={() => { setModalConfirmar(false); sf("status", "Aguardando finalização"); }} disabled={saving || uploading}
            style={{ padding: "11px 0", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer", fontSize: 14 }}>
            ⏳ Não, mudar para Aguardando
          </button>
          <button onClick={() => setModalConfirmar(false)} disabled={saving || uploading}
            style={{ padding: "8px 0", border: "none", background: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 13 }}>
            Voltar e revisar
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <style>{`
        @media (max-width:1024px){.previa-col{position:static !important;flex-basis:100% !important;}}
        .form-apple-nav { position: sticky; top: 0; z-index: 100; background: rgba(255,255,255,0.85); backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px); border-bottom: 1px solid var(--border); }
        .form-apple-nav-inner { max-width: 1100px; margin: 0 auto; height: 54px; padding: 0 20px; display: flex; align-items: center; gap: 14px; }
      `}</style>

      <nav className="form-apple-nav">
        <div className="form-apple-nav-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => navigate("/admin")}>
            <img src={LOGO_URL} alt="Inerente" style={{ height: 24 }} />
            <b style={{ fontSize: 16, fontWeight: 600, color: "var(--primary-dark)" }}>Inerente</b>
          </div>
        </div>
      </nav>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "22px 20px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "1.25rem" }}>
        <button onClick={() => navigate(-1)} style={backBtn}>{"←"} Voltar</button>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text)" }}>
          {id ? "Editar imóvel" : "Novo imóvel"}
        </h2>
      </div>

      {id && !hydrated && (
        <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem 0" }}>Carregando dados do imóvel...</p>
      )}
      {(!id || hydrated) && (<div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 600px", minWidth: 0 }}>


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
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <input
            type="text"
            value={urlDrive}
            onChange={e => setUrlDrive(e.target.value)}
            placeholder="🔗 Cole o link da pasta do Google Drive..."
            style={{ ...inputBase, flex: "1 1 260px", fontSize: 13 }}
            disabled={importandoDrive}
          />
          <button
            onClick={importarDrive}
            disabled={importandoDrive || !urlDrive.trim()}
            style={{
              padding: "9px 16px", borderRadius: 8,
              border: "1px solid #4285f4",
              background: importandoDrive || !urlDrive.trim() ? "var(--bg-muted)" : "rgba(66,133,244,0.12)",
              color: importandoDrive || !urlDrive.trim() ? "var(--text-muted)" : "#4285f4",
              cursor: importandoDrive || !urlDrive.trim() ? "default" : "pointer",
              fontSize: 13, fontWeight: 600, whiteSpace: "nowrap"
            }}>
            {importandoDrive ? "Importando..." : "📥 Importar do Drive"}
          </button>
        </div>
        {importandoDrive && <p style={{ margin: "0 0 12px", fontSize: 11, color: "var(--text-muted)" }}>Baixando as fotos do Drive e enviando ao Cloudinary... aguarde.</p>}
        {/* Prévia ampliada da foto */}
        {previaFoto && (
          <div onClick={() => setPreviaFoto(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}>
            <img src={previaFoto} alt="" style={{ maxWidth: "92vw", maxHeight: "88vh", borderRadius: 12, objectFit: "contain", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }} />
            <button onClick={() => setPreviaFoto(null)}
              style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 28, cursor: "pointer", borderRadius: "50%", width: 44, height: 44, lineHeight: 1 }}>×</button>
            <p style={{ position: "absolute", bottom: 16, color: "rgba(255,255,255,0.6)", fontSize: 13 }}>Clique em qualquer lugar para fechar</p>
          </div>
        )}
        <FotosGrid fotos={form.fotos || []} onChange={fs => sf("fotos", fs)} onRemove={i => sf("fotos", form.fotos.filter((_, idx) => idx !== i))} onPrevia={setPreviaFoto} />
      </>)}

      {section("Informações gerais", <>
        {inp("Título *", "titulo", { ph: "Ex: Casa 3 quartos Setor Sul" })}


        <div style={grid2}>
          <div style={{ marginBottom: "1rem" }}>
            <label style={labelStyle}>Tipo de imóvel</label>
            <select value={form.tipo || tipos[0]?.nome} onChange={e => sf("tipo", e.target.value)} style={{ ...inputBase }}>
              {[...tipos].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map(t => <option key={t.nome}>{t.nome}</option>)}
            </select>
          </div>
          {sel("Tipo de transação", "transacao", TRANSACOES)}
          {sel("Estado do imóvel", "estadoImovel", ESTADOS_IMOVEL)}
        </div>

        {(!isLote || isRural) && inp("Metragem de construção (m²)", "metragem", { type: "number" })}
        {inp("Metragem total do terreno (m²)", "metragemTotal", { type: "number" })}
        {temCondominio && inp("Nome do condomínio", "nomeCondominio")}
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

      {(isLote || isRural) && section("Detalhes do terreno", <>
        {sel("Declive", "declive", ["Plano", "Lateral", "Fundo", "Frente"])}
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 8 }}>{tog("Asfalto", "asfalto")}{tog("Água", "agua")}{tog("Esgoto", "esgoto")}</div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 8 }}>{tog("Muro", "muro")}{tog("Esquina", "esquina")}{tog("Retangular", "retangular")}</div>
        {form.retangular
          ? <div style={grid2}>{inp("Frente (m)", "frente", { type: "number" })}{inp("Laterais (m)", "laterais", { type: "number" })}</div>
          : inp("Medidas", "medidas", { ph: "Ex: 15x30 irregular" })}
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

        {/* Mapa interativo — arraste o pino para marcar o local exato */}
        <div style={{ marginBottom: "1rem", padding: "12px 14px", background: form.coordManual ? "var(--primary-light)" : "var(--bg-muted)", borderRadius: 10, border: `1px solid ${form.coordManual ? "var(--primary)" : "var(--border-soft)"}` }}>
          <label style={labelStyle}>📍 Localização no mapa</label>
          <MapaPino
            latitude={form.latitude}
            longitude={form.longitude}
            enderecoBusca={[form.endereco, form.bairro, form.cidade, form.estado, form.cep].filter(Boolean).join(", ")}
            onChange={(lat, lon) => setForm(p => ({ ...p, latitude: String(lat), longitude: String(lon), coordManual: true }))}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginTop: 10, cursor: "pointer", color: "var(--text-soft)" }}>
            <input type="checkbox" checked={!!form.coordManual}
              onChange={e => setForm(p => ({ ...p, coordManual: e.target.checked }))}
              style={{ width: 14, height: 14, accentColor: "var(--primary)" }} />
            Coordenada ajustada à mão (trava o geocoder — não recalcula ao salvar)
          </label>
        </div>
      </>)}

      {section(isLocacao ? "Valores da locação" : "Valores e condições comerciais", <>
        {isVenda && (
          <div style={grid2}>
            {inp("Preço de venda (R$)", "preco", { type: "number", ph: "Ex: 350000" })}
            {inp("IPTU (R$)", "valorIPTU", { type: "number" })}
            {temCondominio && inp("Valor do condomínio (R$)", "valorCondominio", { type: "number" })}
          </div>
        )}
        {isLocacao && (<>
          <div style={grid2}>
            {inp("Aluguel (R$)", "valorAluguel", { type: "number" })}
            {inp("Condomínio (R$)", "valorCondominio", { type: "number" })}
            {inp("IPTU (R$)", "valorIPTU", { type: "number" })}
          </div>
          <p style={{ margin: "4px 0 12px", fontSize: 14, color: "var(--primary)", fontWeight: 500 }}>Total: {formatBRL(valorFinalLoc()) || "—"}</p>
        </>)}

        {!isLocacao && (<>
          <div style={{ borderTop: "1px solid var(--border-soft)", margin: "14px 0 12px" }} />
          <label style={{ ...labelStyle, fontWeight: 600 }}>Condições comerciais</label>
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

          <div style={{ marginTop: 8, marginBottom: 4 }}>
            {tog("Imóvel de ágio (assumir financiamento)", "_agio")}
          </div>
          {form._agio && (
            <div style={{ marginBottom: 8, padding: 12, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-soft, #fafafa)" }}>
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
        </>)}
      </>)}

      {section("Descrição", <>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Redondezas — o que tem por perto (uma por linha)</label>
          <textarea value={form.redondezas || ""} onChange={e => sf("redondezas", e.target.value)} placeholder={"Ex:\nPerto do Shopping Buriti\nPerto da escola municipal\nPróximo ao supermercado"} rows={3}
            style={{ ...inputBase, resize: "vertical", lineHeight: 1.6 }} />
          <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "4px 0 0" }}>Entram como tópicos na descrição gerada.</p>
        </div>
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

      {section("Captador(es) *", <>
        {listaCaptadores.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 8px" }}>
            Nenhum captador cadastrado ainda. Adicione no <b>Cadastro de Pessoas</b> com a função Captador.
          </p>
        ) : (
          <>
            {/* Select com busca — funciona com qualquer quantidade de captadores */}
            <select
              value=""
              onChange={e => {
                const capId = e.target.value;
                if (!capId) return;
                const atual = form.captadores_ids || [];
                if (atual.includes(capId)) return;
                const novos = [...atual, capId];
                const pct = Math.round(100 / novos.length);
                const captadoresDetalhes = novos.map((cid, idx) => ({
                  id: cid,
                  nome: listaCaptadores.find(c => c.id === cid)?.nome || '',
                  pct: idx === 0 ? (100 - pct * (novos.length - 1)) : pct
                }));
                setForm(p => ({
                  ...p,
                  captadores_ids: novos,
                  captadores_detalhes: captadoresDetalhes,
                  nomeCaptador: captadoresDetalhes.map(c => c.nome).join(', '),
                }));
              }}
              style={{ ...inputBase, color: "var(--text-muted)", marginBottom: 10 }}>
              <option value="">+ Adicionar captador...</option>
              {listaCaptadores
                .filter(cap => !(form.captadores_ids || []).includes(cap.id))
                .map(cap => (
                  <option key={cap.id} value={cap.id}>{cap.nome}{cap.telefone ? ` — ${cap.telefone}` : ""}</option>
                ))}
            </select>

            {/* Captadores selecionados */}
            {(form.captadores_detalhes || []).length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                {(form.captadores_detalhes || []).map((cap, idx) => {
                  const capInfo = listaCaptadores.find(c => c.id === cap.id);
                  return (
                    <div key={cap.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg-card)", borderRadius: 10, padding: "8px 12px", border: "1px solid var(--border-soft)" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{cap.nome}</div>
                        {capInfo?.telefone && (
                          <a href={`https://wa.me/55${capInfo.telefone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                            style={{ fontSize: 12, color: "#25D366", textDecoration: "none" }}>
                            💬 {capInfo.telefone}
                          </a>
                        )}
                      </div>
                      {(form.captadores_detalhes || []).length > 1 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input
                            type="number" min="0" max="100" step="1"
                            value={cap.pct}
                            onChange={e => {
                              const val = Number(e.target.value) || 0;
                              setForm(p => {
                                const det = [...(p.captadores_detalhes || [])];
                                det[idx] = { ...det[idx], pct: val };
                                return { ...p, captadores_detalhes: det };
                              });
                            }}
                            style={{ ...inputBase, width: 60, textAlign: "center", padding: "4px 6px" }}
                          />
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>%</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const novos = (form.captadores_ids || []).filter(x => x !== cap.id);
                          const pct = novos.length > 0 ? Math.round(100 / novos.length) : 0;
                          const captadoresDetalhes = novos.map((cid, i) => ({
                            id: cid,
                            nome: listaCaptadores.find(c => c.id === cid)?.nome || '',
                            pct: i === 0 ? (100 - pct * (novos.length - 1)) : pct
                          }));
                          setForm(p => ({
                            ...p,
                            captadores_ids: novos,
                            captadores_detalhes: captadoresDetalhes,
                            nomeCaptador: captadoresDetalhes.map(c => c.nome).join(', '),
                          }));
                        }}
                        style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 4px" }}>
                        ×
                      </button>
                    </div>
                  );
                })}
                {(form.captadores_detalhes || []).length > 1 && (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", paddingLeft: 4 }}>
                    Total: {(form.captadores_detalhes || []).reduce((s, c) => s + (c.pct || 0), 0)}%
                    {(form.captadores_detalhes || []).reduce((s, c) => s + (c.pct || 0), 0) !== 100 && (
                      <span style={{ color: "#dc2626", marginLeft: 6 }}>⚠ deve somar 100%</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
        <div style={{ display: "none" }}>
          {inp("Nome", "nomeCaptador")}
        </div>
      </>)}


      {/* ONDE FOI ANUNCIADO — acordeão, começa recolhido */}
      <div style={{ ...sectionBox, marginBottom: "1.5rem" }}>
        <button type="button" onClick={() => setMostrarCanais(v => !v)}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: "var(--primary-dark)" }}>Onde foi anunciado <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-muted)" }}>(opcional)</span></span>
          <span style={{ fontSize: 18, color: "var(--text-muted)" }}>{mostrarCanais ? "▲" : "▼"}</span>
        </button>
        {mostrarCanais && (
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 10px" }}>
              Marcação de controle interno — onde este imóvel já foi divulgado. {"⚙"} = integração automática via feed XML.
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
          </div>
        )}
      </div>

      {/* PUBLICAÇÃO — última decisão: status + onde o imóvel aparece */}
      {blocoPublicacao()}

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button onClick={() => navigate(-1)} style={{ flex: 1, padding: "11px 0", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer", fontSize: 14 }}>Cancelar</button>
        <button onClick={onClickSalvar} disabled={saving || uploading}
          style={{ ...btnPrimary, flex: 2, padding: "11px 0", background: (saving || uploading) ? "#aaa" : "var(--primary)", cursor: (saving || uploading) ? "default" : "pointer", fontSize: 14, fontWeight: 500 }}>
          {saving ? "Salvando..." : uploading ? "Aguarde o upload..." : "Salvar imóvel"}
        </button>
      </div>

      {modalPublicar && modalPublicacao()}
      {modalConfirmar && modalConfirmacao()}
      </div>
      <div className="previa-col" style={{ flex: "0 0 320px", position: "sticky", top: 16, alignSelf: "flex-start", maxWidth: "100%" }}>
        <PreviaQualidade form={form} isLote={isLote} />
      </div>
      </div>)}
      </div>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-soft)", marginBottom: 5 };
// Estilos Apple LOCAIS do Form (não afetam outras telas):
const inputBase = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box", background: "var(--bg-input)", color: "var(--text)", outline: "none", fontFamily: "inherit" };
const sectionBox = { background: "var(--bg-card)", borderRadius: 16, padding: "20px 22px", marginBottom: 14, border: "1px solid var(--border)" };
const togStyle = { display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer", marginBottom: 8, color: "var(--text)" };
const cbStyle = { width: 16, height: 16, accentColor: "var(--primary)" };
const grid2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const backBtn = { display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", fontSize: 15, cursor: "pointer", color: "var(--primary)", fontWeight: 500, padding: 0 };
