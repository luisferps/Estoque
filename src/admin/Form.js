import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { addDoc, collection, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import {
  TRANSACOES, ESTADOS_IMOVEL, STATUS_IMOVEL, VISIBILIDADE_IMOVEL, CONDICOES, CANAIS, emptyForm
} from "../constants";
import { useImoveis, useTipos } from "../shared/hooks";
import {
  formatBRL, formatTel, gerarDescricao, uploadToCloudinary, buscarCEP,
  ehTerreno, ehConstrucao, geocodificarEndereco, gerarCodigoImovel, reservarCodigoImovel
} from "../shared/utils";
import { btnPrimary, inputBase, sectionBox, pageWrap } from "../shared/styles";
import FotosGrid from "../shared/FotosGrid";

const CANAIS_AUTO = ["Canal Pro", "Chaves na M\u00e3o", "Cat\u00e1logo Meta"];

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
  "Casa em Condom\u00ednio",
  "Sobrado em Condom\u00ednio",
  "Lote em Condom\u00ednio",
  "Ch\u00e1cara em Condom\u00ednio",
];
function ehEmCondominio(tipo) {
  return TIPOS_EM_CONDOMINIO.includes(String(tipo || "").trim());
}

export default function Form() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { imoveis, loading } = useImoveis();
  const { tipos } = useTipos();
  const [form, setForm] = useState(emptyForm);
  const [hydrated, setHydrated] = useState(!id);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
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
    if (existing) {
      setForm({ ...emptyForm, ...existing, anuncios: migrarAnuncios(existing.anuncios) });
      setTelProprietarioIntl((existing.telefoneProprietario || "").trim().startsWith("+"));
      setTelCaptadorIntl((existing.telefoneCaptador || "").trim().startsWith("+"));
      setHydrated(true);
    } else if (imoveis.length > 0) {
      alert("Im\u00f3vel n\u00e3o encontrado.");
      navigate("/admin");
    }
  }, [id, imoveis, loading, navigate]);

  // isLote por comportamento OU por nome (pega "Lote em Condomínio", "Lote Comercial",
  // "Área Comercial" etc. mesmo se o comportamento no cadastro estiver errado/vazio).
  const nomeTipoLower = (form.tipo || "").toLowerCase();
  const pareceLote = /lote|terreno|gleba|loteamento|\bárea\b|\barea\b/.test(nomeTipoLower);
  const isLote = ehTerreno(form.tipo, tipos) || pareceLote;
  const isConstrucao = ehConstrucao(form.tipo, tipos) && !isLote;
  const isLocacao = form.transacao === "Loca\u00e7\u00e3o";
  const isVenda = form.transacao === "Venda" || form.transacao === "Venda e Loca\u00e7\u00e3o";
  const emCondominio = ehEmCondominio(form.tipo);

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
    if (!form.titulo) return alert("Preencha o t\u00edtulo.");
    if (!telefoneValido(form.telefoneProprietario, telProprietarioIntl))
      return alert("Informe o telefone do propriet\u00e1rio: nacional (fixo 10 d\u00edgitos ou celular 11) ou internacional (com + e c\u00f3digo do pa\u00eds).");
    if (!telefoneValido(form.telefoneCaptador, telCaptadorIntl))
      return alert("Informe o telefone do captador: nacional (fixo 10 d\u00edgitos ou celular 11) ou internacional (com + e c\u00f3digo do pa\u00eds).");
    setSaving(true);
    try {
      const { id: _id, ...data } = form;
      // Tipos "em condominio" sao tipos proprios; a flag antiga nao e mais usada.
      // Garante coerencia: tipo de condominio -> condominio=true; senao limpa a flag.
      data.condominio = ehEmCondominio(data.tipo);
      if (!data.condominio) data.nomeCondominio = "";
      if (isLocacao) data.valorFinal = valorFinalLoc();
      if (!data.status) data.status = "Dispon\u00edvel";
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
      if (id) await updateDoc(doc(db, "imoveis", id), data);
      else await addDoc(collection(db, "imoveis"), { ...data, createdAt: Date.now() });
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
        {invalido && <p style={{ margin: "4px 0 0", fontSize: 11, color: "#c0392b" }}>{intl ? "N\u00famero internacional inv\u00e1lido. Use o formato +c\u00f3digo n\u00famero." : "N\u00famero incompleto. Use fixo (10 d\u00edgitos) ou celular (11 d\u00edgitos com 9)."}</p>}
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
    <div style={pageWrap(680)}>
      <div style={{ marginBottom: "1.5rem" }}>
        <button onClick={() => navigate(-1)} style={backBtn}>{"\u2190"} Cancelar</button>
      </div>
      <h2 style={{ margin: "0 0 1.5rem", fontSize: 20, fontWeight: 500, color: "var(--primary-dark)" }}>
        {id ? "Editar im\u00f3vel" : "Novo im\u00f3vel"}
      </h2>

      {id && !hydrated && (
        <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem 0" }}>Carregando dados do im\u00f3vel...</p>
      )}
      {(!id || hydrated) && <>

      {section("Informa\u00e7\u00f5es gerais", <>
        {inp("T\u00edtulo *", "titulo", { ph: "Ex: Casa 3 quartos Setor Sul" })}

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
            <label style={labelStyle}>Tipo de im\u00f3vel</label>
            <select value={form.tipo || tipos[0]?.nome} onChange={e => sf("tipo", e.target.value)} style={{ ...inputBase }}>
              {tipos.map(t => <option key={t.nome}>{t.nome}</option>)}
            </select>
          </div>
          {sel("Tipo de transa\u00e7\u00e3o", "transacao", TRANSACOES)}
          {sel("Estado do im\u00f3vel", "estadoImovel", ESTADOS_IMOVEL)}
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

        {!isLote && inp("Metragem de constru\u00e7\u00e3o (m\u00b2)", "metragem", { type: "number" })}
        {inp("Metragem total do terreno (m\u00b2)", "metragemTotal", { type: "number" })}
        {emCondominio && inp("Nome do condom\u00ednio", "nomeCondominio")}
      </>)}

      {!isLocacao && section("Condi\u00e7\u00f5es comerciais", <>
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
        <FotosGrid fotos={form.fotos || []} onChange={fs => sf("fotos", fs)} onRemove={i => sf("fotos", form.fotos.filter((_, idx) => idx !== i))} />
      </>)}

      {section("Localiza\u00e7\u00e3o", <>
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
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>Digite o CEP (somente n\u00fameros) para preencher automaticamente.</p>
        </div>
        <div style={grid2}>
          <div style={{ marginBottom: "1rem" }}>
            <label style={labelStyle}>Cidade</label>
            <input value={form.cidade || ""} onChange={e => {
              sf("cidade", e.target.value);
              geocodingSilencioso(e.target.value, form.bairro, form.estado, form.endereco, form.cep);
            }} placeholder="Ex: Goi\u00e2nia" style={inputBase} />
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
        {inp("Endere\u00e7o (vis\u00edvel s\u00f3 para admin)", "endereco", { ph: "Ex: Rua das Flores, 123" })}
        <div style={{ marginBottom: "1rem" }}>
          <label style={labelStyle}>Link do Google Maps</label>
          <input value={form.mapsLink || ""} onChange={e => sf("mapsLink", e.target.value)} placeholder="Cole aqui o link do Google Maps" style={inputBase} />
          {form.mapsLink && <a href={form.mapsLink} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "var(--primary)", textDecoration: "none" }}>Verificar link {"\u2192"}</a>}
        </div>
        {isLote && <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>{tog("Asfalto", "asfalto")}{tog("\u00c1gua", "agua")}{tog("Esgoto", "esgoto")}</div>}
      </>)}

      {isLote && section("Detalhes do " + form.tipo, <>
        {sel("Declive", "declive", ["Plano", "Lateral", "Fundo", "Frente"])}
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 8 }}>{tog("Muro", "muro")}{tog("Esquina", "esquina")}{tog("Retangular", "retangular")}</div>
        {form.retangular
          ? <div style={grid2}>{inp("Frente (m)", "frente", { type: "number" })}{inp("Laterais (m)", "laterais", { type: "number" })}</div>
          : inp("Medidas", "medidas", { ph: "Ex: 15x30 irregular" })}
      </>)}

      {isConstrucao && section("Detalhes da " + form.tipo, <>
        <div style={grid2}>
          {inp("Quartos", "quartos", { type: "number" })}
          {inp("Su\u00edtes", "suites", { type: "number" })}
          {inp("Garagens", "garagens", { type: "number" })}
          {inp("Banheiros", "banheiros", { type: "number" })}
          {inp("Valor de avalia\u00e7\u00e3o (R$)", "valorAvaliacao", { type: "number" })}
          {inp("Valor de entrada (R$)", "valorEntrada", { type: "number" })}
          {(form.tipo === "Apartamento" || form.tipo === "Casa em Condom\u00ednio" || form.tipo === "Sobrado em Condom\u00ednio") && inp("Valor do condom\u00ednio (R$)", "valorCondominio", { type: "number" })}
        </div>
      </>)}

      {isVenda && section("Valor de venda", inp("Pre\u00e7o de venda (R$)", "preco", { type: "number", ph: "Ex: 350000" }))}

      {isLocacao && section("Valores de loca\u00e7\u00e3o", <>
        <div style={grid2}>
          {inp("Aluguel (R$)", "valorAluguel", { type: "number" })}
          {inp("Condom\u00ednio (R$)", "valorCondominio", { type: "number" })}
          {inp("IPTU (R$)", "valorIPTU", { type: "number" })}
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--primary)", fontWeight: 500 }}>Total: {formatBRL(valorFinalLoc()) || "\u2014"}</p>
      </>)}

      {section("Descri\u00e7\u00e3o", <>
        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>Caracter\u00edsticas extras (uma por linha)</label>
          <textarea value={form.extras || ""} onChange={e => sf("extras", e.target.value)} placeholder={"Ex:\nAr condicionado\nPiscina aquecida"} rows={3}
            style={{ ...inputBase, resize: "vertical", lineHeight: 1.6 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <label style={{ fontSize: 13, color: "var(--text-soft)" }}>Descri\u00e7\u00e3o completa (edit\u00e1vel)</label>
          <button onClick={() => sf("descricao", gerarDescricao(form))}
            style={{ fontSize: 12, padding: "4px 12px", borderRadius: 7, border: "1px solid var(--primary)", background: "var(--primary-light)", color: "var(--primary)", cursor: "pointer" }}>
            Gerar automaticamente
          </button>
        </div>
        <textarea value={form.descricao || ""} onChange={e => sf("descricao", e.target.value)} placeholder="Clique em 'Gerar automaticamente' ou escreva manualmente..." rows={10}
          style={{ ...inputBase, resize: "vertical", lineHeight: 1.6 }} />
      </>)}

      {section("Propriet\u00e1rio (vis\u00edvel s\u00f3 para admin) *", <>
        <div style={grid2}>{inp("Nome", "nomeProprietario")}{inpTel("Telefone *", "telefoneProprietario", telProprietarioIntl, setTelProprietarioIntl)}</div>
      </>)}

      {section("Captador *", <>
        <div style={grid2}>{inp("Nome", "nomeCaptador")}{inpTel("Telefone *", "telefoneCaptador", telCaptadorIntl, setTelCaptadorIntl)}</div>
      </>)}

      {section("Onde foi anunciado (vis\u00edvel s\u00f3 para admin)", <>
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 10px" }}>
          {"\u2699"} = integra\u00e7\u00e3o autom\u00e1tica via feed XML
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
                  {isAuto && <span style={{ fontSize: 11, color: "var(--primary)", marginRight: 4 }}>{"\u2699"}</span>}
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
          {saving ? "Salvando..." : uploading ? "Aguarde o upload..." : "Salvar im\u00f3vel"}
        </button>
      </div>
      </>}
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 13, color: "var(--text-soft)", marginBottom: 4 };
const togStyle = { display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer", marginBottom: 8, color: "var(--text)" };
const cbStyle = { width: 16, height: 16, accentColor: "var(--primary)" };
const grid2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const backBtn = { display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", fontSize: 15, cursor: "pointer", color: "var(--primary)", fontWeight: 500, padding: 0 };
