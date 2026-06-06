import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { addDoc, collection, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import {
  TRANSACOES, ESTADOS_IMOVEL, STATUS_IMOVEL, CONDICOES, CANAIS, emptyForm
} from "../constants";
import { useImoveis, useTipos } from "../shared/hooks";
import {
  formatBRL, formatTel, gerarDescricao, uploadToCloudinary, buscarCEP,
  ehTerreno, ehConstrucao, geocodificarEndereco
} from "../shared/utils";
import { btnPrimary, inputBase, sectionBox, pageWrap } from "../shared/styles";
import FotosGrid from "../shared/FotosGrid";

// Canais integrados automaticamente (marcados com indicador visual)
const CANAIS_AUTO = ["Canal Pro", "Chaves na Mão", "Catálogo Meta"];

// Mapeamento de nomes antigos → novos (migração silenciosa ao editar)
const MIGRAR_CANAIS = {
  "Whatsapp": "WhatsApp Status",
  "Grupos": "WhatsApp Grupos",
  "Google Business": "Google Posts",
  "Instagram": "Instagram Post",
  "Marketplace Facebook": "Marketplace Facebook",
};

export default function Form() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { imoveis, loading } = useImoveis();
  const { tipos } = useTipos();
  const [form, setForm] = useState(emptyForm);
  const [hydrated, setHydrated] = useState(!id);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [addTipoOpen, setAddTipoOpen] = useState(false);
  const [novoTipoNome, setNovoTipoNome] = useState("");
  const [novoTipoIcone, setNovoTipoIcone] = useState("🏘️");
  const [novoTipoComp, setNovoTipoComp] = useState("simples");
  const [salvandoTipo, setSalvandoTipo] = useState(false);
  const fileRef = useRef();

  const TIPOS_PADRAO_SEED = [
    { nome: "Lote", icone: "📐", comportamento: "terreno", ordem: 0 },
    { nome: "Casa", icone: "🏠", comportamento: "construcao", ordem: 1 },
    { nome: "Apartamento", icone: "🏢", comportamento: "construcao", ordem: 2 },
    { nome: "Área", icone: "🌳", comportamento: "terreno", ordem: 3 },
    { nome: "Galpão", icone: "🏭", comportamento: "simples", ordem: 4 },
  ];

  const criarTipoRapido = async () => {
    const n = novoTipoNome.trim();
    if (!n) return alert("Digite o nome do tipo.");
    if (tipos.some(t => t.nome.toLowerCase() === n.toLowerCase())) return alert("Esse tipo já existe.");
    setSalvandoTipo(true);
    try {
      const noBanco = tipos.some(t => t.id);
      if (!noBanco) for (const t of TIPOS_PADRAO_SEED) await addDoc(collection(db, "tipos"), t);
      const ordem = tipos.reduce((m, t) => Math.max(m, t.ordem || 0), 0) + 1;
      await addDoc(collection(db, "tipos"), { nome: n, icone: novoTipoIcone, comportamento: novoTipoComp, ordem });
      sf("tipo", n);
      setNovoTipoNome(""); setNovoTipoIcone("🏘️"); setNovoTipoComp("simples"); setAddTipoOpen(false);
    } catch (e) { alert("Erro: " + e.message); }
    setSalvandoTipo(false);
  };

  // Migra flags antigos para novos nomes ao carregar imóvel para edição
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
      setHydrated(true);
    } else if (imoveis.length > 0) {
      alert("Imóvel não encontrado.");
      navigate("/admin");
    }
  }, [id, imoveis, loading, navigate]);

  const isLote = ehTerreno(form.tipo, tipos);
  const isConstrucao = ehConstrucao(form.tipo, tipos);
  const isLocacao = form.transacao === "Locação";
  const isVenda = form.transacao === "Venda" || form.transacao === "Venda e Locação";

  const sf = (key, val) => setForm(p => ({ ...p, [key]: val }));
  const valorFinalLoc = () => (parseFloat(form.valorAluguel) || 0) + (parseFloat(form.valorCondominio) || 0) + (parseFloat(form.valorIPTU) || 0) || "";
  const toggleCondicao = (c) =>
    setForm(p => ({ ...p, condicoes: p.condicoes?.includes(c) ? p.condicoes.filter(x => x !== c) : [...(p.condicoes || []), c] }));
  const toggleAnuncio = (canal) => {
    const atual = form.anuncios?.[canal];
    setForm(p => ({ ...p, anuncios: { ...p.anuncios, [canal]: atual ? null : { ativo: true, data: new Date().toLocaleDateString("pt-BR") } } }));
  };

  // Dispara geocoding manual
  const buscarCoordenadas = async () => {
    if (!form.cidade) return alert("Preencha pelo menos a cidade antes de buscar coordenadas.");
    setGeocoding(true);
    const coords = await geocodificarEndereco({
      endereco: form.endereco,
      bairro: form.bairro,
      cidade: form.cidade,
      estado: form.estado,
      cep: form.cep,
    });
    setGeocoding(false);
    if (coords) {
      setForm(p => ({ ...p, latitude: coords.latitude, longitude: coords.longitude }));
    } else {
      alert("Não foi possível encontrar as coordenadas. Verifique o endereço ou preencha manualmente.");
    }
  };

  const save = async () => {
    if (!form.titulo) return alert("Preencha o título.");
    setSaving(true);
    try {
      const { id: _id, ...data } = form;
      if (isLocacao) data.valorFinal = valorFinalLoc();
      if (!data.status) data.status = "Disponível";

      // Geocoding automático ao salvar se ainda não tem coordenadas
      if (!data.latitude && !data.longitude && data.cidade) {
        setGeocoding(true);
        const coords = await geocodificarEndereco({
          endereco: data.endereco,
          bairro: data.bairro,
          cidade: data.cidade,
          estado: data.estado,
          cep: data.cep,
        });
        setGeocoding(false);
        if (coords) {
          data.latitude = coords.latitude;
          data.longitude = coords.longitude;
        }
      }

      if (id) await updateDoc(doc(db, "imoveis", id), data);
      else await addDoc(collection(db, "imoveis"), { ...data, createdAt: Date.now() });
      navigate("/admin");
    } catch (e) {
      alert("Erro: " + e.message);
    }
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
    } catch (err) {
      alert("Erro upload: " + err.message);
    }
    setUploading(false);
    e.target.value = "";
  };

  // ─── Helpers de input ───
  const inp = (label, key, opts = {}) => (
    <div style={{ marginBottom: "1rem" }}>
      <label style={labelStyle}>{label}</label>
      <input type={opts.type || "text"} value={form[key] || ""} onChange={e => sf(key, e.target.value)} placeholder={opts.ph || ""} style={inputBase} />
    </div>
  );
  const inpTel = (label, key) => (
    <div style={{ marginBottom: "1rem" }}>
      <label style={labelStyle}>{label}</label>
      <input type="tel" value={form[key] || ""} onChange={e => sf(key, formatTel(e.target.value))} placeholder="(62) 9 9999-9999" style={inputBase} />
    </div>
  );
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

  const savingText = geocoding ? "Buscando coordenadas..." : saving ? "Salvando..." : uploading ? "Aguarde o upload..." : "Salvar imóvel";

  return (
    <div style={pageWrap(680)}>
      <div style={{ marginBottom: "1.5rem" }}>
        <button onClick={() => navigate(-1)} style={backBtn}>← Cancelar</button>
      </div>
      <h2 style={{ margin: "0 0 1.5rem", fontSize: 20, fontWeight: 500, color: "var(--primary-dark)" }}>
        {id ? "Editar imóvel" : "Novo imóvel"}
      </h2>

      {id && !hydrated && (
        <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem 0" }}>Carregando dados do imóvel...</p>
      )}
      {(!id || hydrated) && <>

      {section("Informações gerais", <>
        {inp("Título *", "titulo", { ph: "Ex: Casa 3 quartos Setor Sul" })}
        <div style={grid2}>
          <div style={{ marginBottom: "1rem" }}>
            <label style={labelStyle}>Tipo de imóvel</label>
            <div style={{ display: "flex", gap: 6 }}>
              <select value={form.tipo || tipos[0]?.nome} onChange={e => sf("tipo", e.target.value)} style={{ ...inputBase, flex: 1 }}>
                {tipos.map(t => <option key={t.nome}>{t.nome}</option>)}
              </select>
              <button type="button" onClick={() => setAddTipoOpen(o => !o)} title="Criar novo tipo"
                style={{ padding: "0 14px", borderRadius: 8, border: "1px solid var(--primary)", background: "var(--primary-light)", color: "var(--primary-dark)", cursor: "pointer", fontSize: 18, fontWeight: 700 }}>
                {addTipoOpen ? "×" : "+"}
              </button>
            </div>
          </div>
          {sel("Tipo de transação", "transacao", TRANSACOES)}
          {sel("Estado do imóvel", "estadoImovel", ESTADOS_IMOVEL)}
          {sel("Status", "status", STATUS_IMOVEL)}
        </div>

        {addTipoOpen && (
          <div style={{ background: "var(--bg-muted)", border: "1px solid var(--primary-border)", borderRadius: 10, padding: "1rem", marginBottom: "1rem" }}>
            <p style={{ margin: "0 0 10px", fontWeight: 500, fontSize: 14, color: "var(--primary-dark)" }}>Criar novo tipo de imóvel</p>
            <input value={novoTipoNome} onChange={e => setNovoTipoNome(e.target.value)} placeholder="Nome (ex: Chácara)" style={{ ...inputBase, marginBottom: 8 }} />
            <label style={labelStyle}>Ícone</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {["🏠","🏢","📐","🌳","🏭","🏘️","🏡","🏬","🏗️","🏞️","🏖️","🚜","🛖","🏟️","🏨","🏪"].map(e => (
                <button key={e} type="button" onClick={() => setNovoTipoIcone(e)} style={{ fontSize: 20, padding: "3px 7px", borderRadius: 7, cursor: "pointer", border: novoTipoIcone === e ? "2px solid var(--primary)" : "1px solid var(--border-soft)", background: novoTipoIcone === e ? "var(--primary-light)" : "var(--bg-input)" }}>{e}</button>
              ))}
            </div>
            <label style={labelStyle}>Comportamento (campos que aparecem)</label>
            <select value={novoTipoComp} onChange={e => setNovoTipoComp(e.target.value)} style={{ ...inputBase, marginBottom: 10 }}>
              <option value="terreno">Terreno (asfalto, água, declive, medidas)</option>
              <option value="construcao">Construção (quartos, suítes, garagens)</option>
              <option value="simples">Simples (só campos básicos)</option>
            </select>
            <button type="button" onClick={criarTipoRapido} disabled={salvandoTipo}
              style={{ ...btnPrimary, width: "100%", padding: "10px 0", opacity: salvandoTipo ? 0.6 : 1 }}>
              {salvandoTipo ? "Criando..." : `Criar e selecionar "${novoTipoNome || "tipo"}"`}
            </button>
          </div>
        )}
        {inp("Metragem de construção (m²)", "metragem", { type: "number" })}
        {inp("Metragem total do terreno (m²)", "metragemTotal", { type: "number" })}
        {tog("Em condomínio?", "condominio")}
        {form.condominio && inp("Nome do condomínio", "nomeCondominio")}
      </>)}

      {section("Condições comerciais", <>
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

      {section("Localização", <>
        <div style={{ marginBottom: "1rem" }}>
          <label style={labelStyle}>CEP</label>
          <input value={form.cep || ""} onChange={e => {
            sf("cep", e.target.value);
            buscarCEP(e.target.value, (data) => {
              setForm(p => ({
                ...p,
                endereco: [data.logradouro, data.complemento].filter(Boolean).join(", ") || p.endereco,
                bairro: data.bairro || p.bairro,
                cidade: data.localidade || p.cidade,
                estado: data.uf || p.estado,
              }));
            });
          }} placeholder="Ex: 74000000" maxLength={8} style={inputBase} />
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>Digite o CEP (somente números) para preencher automaticamente.</p>
        </div>
        <div style={grid2}>
          {inp("Cidade", "cidade", { ph: "Ex: Goiânia" })}
          <div style={{ marginBottom: "1rem" }}>
            <label style={labelStyle}>Estado (UF)</label>
            <input value={form.estado || ""} onChange={e => sf("estado", e.target.value.toUpperCase().slice(0, 2))}
              placeholder="GO" maxLength={2} style={inputBase} />
          </div>
        </div>
        {inp("Bairro", "bairro", { ph: "Ex: Setor Sul" })}
        {inp("Endereço (visível só para admin)", "endereco", { ph: "Ex: Rua das Flores, 123" })}

        {/* Coordenadas geográficas — usadas pelos portais (Canal Pro, Meta) */}
        <div style={{ marginBottom: "1rem" }}>
          <label style={labelStyle}>Coordenadas (latitude / longitude)</label>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <input value={form.latitude || ""} onChange={e => sf("latitude", e.target.value)}
                placeholder="Ex: -16.6869" style={inputBase} />
            </div>
            <div style={{ flex: 1 }}>
              <input value={form.longitude || ""} onChange={e => sf("longitude", e.target.value)}
                placeholder="Ex: -49.2648" style={inputBase} />
            </div>
            <button type="button" onClick={buscarCoordenadas} disabled={geocoding}
              style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid var(--primary)", background: "var(--primary-light)", color: "var(--primary-dark)", cursor: geocoding ? "default" : "pointer", fontSize: 13, whiteSpace: "nowrap", opacity: geocoding ? 0.6 : 1 }}>
              {geocoding ? "Buscando..." : "📍 Buscar"}
            </button>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
            Preenchido automaticamente ao salvar. Clique em "Buscar" para forçar agora. Obrigatório para o Catálogo Meta.
          </p>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={labelStyle}>Link do Google Maps</label>
          <input value={form.mapsLink || ""} onChange={e => sf("mapsLink", e.target.value)} placeholder="Cole aqui o link do Google Maps" style={inputBase} />
          {form.mapsLink && <a href={form.mapsLink} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "var(--primary)", textDecoration: "none" }}>Verificar link →</a>}
        </div>
        {isLote && <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>{tog("Asfalto", "asfalto")}{tog("Água", "agua")}{tog("Esgoto", "esgoto")}</div>}
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
          {inp("Suítes", "suites", { type: "number" })}
          {inp("Garagens", "garagens", { type: "number" })}
          {inp("Banheiros", "banheiros", { type: "number" })}
          {inp("Valor de avaliação (R$)", "valorAvaliacao", { type: "number" })}
          {inp("Valor de entrada (R$)", "valorEntrada", { type: "number" })}
          {form.tipo === "Apartamento" && inp("Valor do condomínio (R$)", "valorCondominio", { type: "number" })}
        </div>
      </>)}

      {isVenda && section("Valor de venda", inp("Preço de venda (R$)", "preco", { type: "number", ph: "Ex: 350000" }))}

      {isLocacao && section("Valores de locação", <>
        <div style={grid2}>
          {inp("Aluguel (R$)", "valorAluguel", { type: "number" })}
          {inp("Condomínio (R$)", "valorCondominio", { type: "number" })}
          {inp("IPTU (R$)", "valorIPTU", { type: "number" })}
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--primary)", fontWeight: 500 }}>Total: {formatBRL(valorFinalLoc()) || "—"}</p>
      </>)}

      {section("Descrição", <>
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

      {section("Proprietário (visível só para admin)", <>
        <div style={grid2}>{inp("Nome", "nomeProprietario")}{inpTel("Telefone", "telefoneProprietario")}</div>
      </>)}

      {section("Captador", <>
        <div style={grid2}>{inp("Nome", "nomeCaptador")}{inpTel("Telefone", "telefoneCaptador")}</div>
      </>)}

      {section("Onde foi anunciado (visível só para admin)", <>
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 10px" }}>
          ⚙ = integração automática via feed XML
        </p>
        {CANAIS.map(canal => {
          const info = form.anuncios?.[canal];
          const isAuto = CANAIS_AUTO.includes(canal);
          return (
            <div key={canal} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1 }}>
                <input type="checkbox" checked={!!info?.ativo} onChange={() => toggleAnuncio(canal)} style={cbStyle} />
                <span style={{ fontSize: 14 }}>
                  {isAuto && <span style={{ fontSize: 11, color: "var(--primary)", marginRight: 4 }}>⚙</span>}
                  {canal}
                </span>
              </label>
              {info?.ativo && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{info.data}</span>}
            </div>
          );
        })}
      </>)}

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button onClick={() => navigate(-1)} style={{ flex: 1, padding: "11px 0", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer", fontSize: 14 }}>Cancelar</button>
        <button onClick={save} disabled={saving || uploading || geocoding}
          style={{ ...btnPrimary, flex: 2, padding: "11px 0", background: (saving || uploading || geocoding) ? "#aaa" : "var(--primary)", cursor: (saving || uploading || geocoding) ? "default" : "pointer", fontSize: 14, fontWeight: 500 }}>
          {savingText}
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
