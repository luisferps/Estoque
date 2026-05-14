import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, orderBy, query } from "firebase/firestore";

const ADMIN_PASS = "123livre";
const TIPOS = ["Lote", "Casa", "Apartamento", "Área"];
const TRANSACOES = ["Venda", "Locação"];
const CANAIS = ["Canal Pro", "Chaves na Mão", "Marketplace Facebook", "Google Business", "Instagram", "Whatsapp", "Grupos"];
const CONDICOES = ["À vista", "Financiamento", "Permuta"];
const CLOUDINARY_CLOUD = "demsusjwf";
const CLOUDINARY_PRESET = "Estoque";

const firebaseConfig = {
  apiKey: "AIzaSyB8Jq17jELr17zonEVmLRjy-p7dmeLLskw",
  authDomain: "estoque-53f1e.firebaseapp.com",
  projectId: "estoque-53f1e",
  storageBucket: "estoque-53f1e.firebasestorage.app",
  messagingSenderId: "265114904725",
  appId: "1:265114904725:web:c97ac40636b76b6c8f939c"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function formatBRL(v) {
  const n = parseFloat(v);
  if (!n) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

const emptyForm = {
  id: null, titulo: "", tipo: "Casa", transacao: "Venda", preco: "", descricao: "", mapsLink: "",
  cidade: "", bairro: "", endereco: "", asfalto: false, agua: false, esgoto: false,
  metragem: "", metragemTotal: "", nomeProprietario: "", telefoneProprietario: "",
  nomeCaptador: "", telefoneCaptador: "", condominio: false, nomeCondominio: "", valorCondominioMensal: "",
  declive: "Plano", muro: false, esquina: false, retangular: false, frente: "", laterais: "", medidas: "",
  quartos: "", suites: "", valorAvaliacao: "", valorEntrada: "", valorCondominio: "",
  valorAluguel: "", valorIPTU: "",
  condicoes: [], permuta: "",
  anuncios: {}, fotos: [],
};

async function uploadToCloudinary(file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", CLOUDINARY_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: "POST", body: fd });
  const data = await res.json();
  if (!data.secure_url) throw new Error("Falha no upload da foto");
  return data.secure_url;
}

export default function App() {
  const [imoveis, setImoveis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingFotos, setUploadingFotos] = useState(false);
  const [view, setView] = useState("lista");
  const [form, setForm] = useState(emptyForm);
  const [fotoIdx, setFotoIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPassModal, setShowPassModal] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [passError, setPassError] = useState(false);
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("Todos");
  const [filterTransacao, setFilterTransacao] = useState("Todos");
  const [lightbox, setLightbox] = useState(null);
  const fileRef = useRef();

  useEffect(() => {
    const q = query(collection(db, "imoveis"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, snap => {
      setImoveis(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const sf = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const valorFinalLocacao = () => {
    const a = parseFloat(form.valorAluguel) || 0;
    const c = parseFloat(form.valorCondominio) || 0;
    const i = parseFloat(form.valorIPTU) || 0;
    return a + c + i || "";
  };

  const toggleCondicao = (c) => {
    setForm(p => ({
      ...p,
      condicoes: p.condicoes?.includes(c) ? p.condicoes.filter(x => x !== c) : [...(p.condicoes || []), c]
    }));
  };

  const handleLogin = () => {
    if (passInput === ADMIN_PASS) { setIsAdmin(true); setShowPassModal(false); setPassInput(""); setPassError(false); }
    else setPassError(true);
  };

  const save = async () => {
    if (!form.titulo) return alert("Preencha o título do imóvel.");
    setSaving(true);
    try {
      const { id, ...data } = form;
      if (form.transacao === "Locação") data.valorFinal = valorFinalLocacao();
      if (id) await updateDoc(doc(db, "imoveis", id), data);
      else await addDoc(collection(db, "imoveis"), { ...data, createdAt: Date.now() });
      setView("lista");
    } catch (e) { alert("Erro ao salvar: " + e.message); }
    setSaving(false);
  };

  const del = async (id) => {
    if (!window.confirm("Excluir este imóvel?")) return;
    await deleteDoc(doc(db, "imoveis", id));
  };

  const edit = (im) => { setForm({ ...emptyForm, ...im }); setView("form"); };
  const openDetalhe = (im) => { setSelected(im); setFotoIdx(0); setView("detalhe"); };

  const addFotos = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploadingFotos(true);
    try {
      const urls = await Promise.all(files.map(f => uploadToCloudinary(f)));
      setForm(p => ({ ...p, fotos: [...(p.fotos || []), ...urls] }));
    } catch (err) { alert("Erro ao enviar foto: " + err.message); }
    setUploadingFotos(false);
    e.target.value = "";
  };

  const removeFoto = (i) => setForm(p => ({ ...p, fotos: p.fotos.filter((_, idx) => idx !== i) }));

  const whatsappDescricao = (im) => {
    const vf = im.transacao === "Locação" ? im.valorFinal : im.preco;
    const label = im.transacao === "Locação" ? "💰 Valor total: " : "💰 ";
    const condicoesTxt = im.condicoes?.length ? `\n✅ ${im.condicoes.join(", ")}${im.condicoes.includes("Permuta") && im.permuta ? ` (${im.permuta})` : ""}` : "";
    const txt = `🏠 *${im.titulo || "Imóvel disponível"}*\n` +
      (im.transacao ? `📋 ${im.transacao}\n` : "") +
      (im.cidade || im.bairro ? `📍 ${[im.bairro, im.cidade].filter(Boolean).join(", ")}\n` : "") +
      (vf ? `${label}${formatBRL(vf)}\n` : "") +
      condicoesTxt +
      (im.descricao ? `\n${im.descricao}` : "");
    window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
  };

  const whatsappMaps = (im) => {
    if (!im.mapsLink) return alert("Este imóvel não tem link do Google Maps.");
    window.open("https://wa.me/?text=" + encodeURIComponent(`📍 *Localização do imóvel:*\n${im.mapsLink}`), "_blank");
  };

  const downloadFotos = async (im) => {
    if (!im.fotos?.length) return alert("Este imóvel não tem fotos.");
    for (let i = 0; i < im.fotos.length; i++) {
      try {
        const res = await fetch(im.fotos[i]);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `${im.titulo || "imovel"}_foto${i + 1}.jpg`; a.click();
        URL.revokeObjectURL(url);
        await new Promise(r => setTimeout(r, 300));
      } catch {}
    }
  };

  const toggleAnuncio = (canal) => {
    const atual = form.anuncios?.[canal];
    setForm(p => ({
      ...p,
      anuncios: { ...p.anuncios, [canal]: atual ? null : { ativo: true, data: new Date().toLocaleDateString("pt-BR") } }
    }));
  };

  const filtered = imoveis.filter(im => {
    const q = search.toLowerCase();
    const matchQ = !q || (im.titulo || "").toLowerCase().includes(q) ||
      (im.descricao || "").toLowerCase().includes(q) ||
      (im.cidade || "").toLowerCase().includes(q) ||
      (im.bairro || "").toLowerCase().includes(q);
    const matchT = filterTipo === "Todos" || im.tipo === filterTipo;
    const matchTr = filterTransacao === "Todos" || im.transacao === filterTransacao;
    return matchQ && matchT && matchTr;
  });

  const inp = (label, key, opts = {}) => (
    <div style={{ marginBottom: "1rem" }}>
      <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 4 }}>{label}</label>
      <input type={opts.type || "text"} value={form[key] || ""} onChange={e => sf(key, e.target.value)} placeholder={opts.ph || ""}
        style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box" }} />
    </div>
  );

  const tog = (label, key) => (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer", marginBottom: 8 }}>
      <input type="checkbox" checked={!!form[key]} onChange={e => sf(key, e.target.checked)} style={{ width: 16, height: 16 }} />
      {label}
    </label>
  );

  const sel = (label, key, opts) => (
    <div style={{ marginBottom: "1rem" }}>
      <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 4 }}>{label}</label>
      <select value={form[key] || opts[0]} onChange={e => sf(key, e.target.value)}
        style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14 }}>
        {opts.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  );

  const section = (title, children) => (
    <div style={{ background: "#f8f8f8", borderRadius: 10, padding: "1rem", marginBottom: "1rem" }}>
      <p style={{ margin: "0 0 12px", fontWeight: 500, fontSize: 14, color: "#333" }}>{title}</p>
      {children}
    </div>
  );

  const Lightbox = () => lightbox === null ? null : (
    <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, cursor: "zoom-out" }}>
      <img src={lightbox} alt="" style={{ maxWidth: "95vw", maxHeight: "95vh", objectFit: "contain", borderRadius: 8 }} />
    </div>
  );

  const PassModal = () => (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: "2rem", width: 300, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
        <h3 style={{ margin: "0 0 1rem", fontSize: 18 }}>🔐 Acesso Admin</h3>
        <input type="password" value={passInput} onChange={e => { setPassInput(e.target.value); setPassError(false); }}
          onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="Digite a senha" autoFocus
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: passError ? "1px solid #E24B4A" : "1px solid #ddd", fontSize: 15, boxSizing: "border-box", marginBottom: 8 }} />
        {passError && <p style={{ color: "#E24B4A", fontSize: 13, margin: "0 0 8px" }}>Senha incorreta.</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { setShowPassModal(false); setPassInput(""); setPassError(false); }}
            style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer" }}>Cancelar</button>
          <button onClick={handleLogin}
            style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", background: "#1D9E75", color: "#fff", cursor: "pointer", fontWeight: 500 }}>Entrar</button>
        </div>
      </div>
    </div>
  );

  // ── LISTA ──
  if (view === "lista") return (
    <div style={{ fontFamily: "sans-serif", padding: "1rem", maxWidth: 900, margin: "0 auto" }}>
      <Lightbox />
      {showPassModal && <PassModal />}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>🏠 Imóveis Disponíveis</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isAdmin ? <>
            <span style={{ fontSize: 12, color: "#1D9E75", fontWeight: 500 }}>✅ Admin</span>
            <button onClick={() => setIsAdmin(false)} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 7, border: "1px solid #ddd", background: "#fff", cursor: "pointer" }}>Sair</button>
            <button onClick={() => { setForm(emptyForm); setView("form"); }}
              style={{ background: "#1D9E75", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 500, fontSize: 14 }}>+ Novo</button>
          </> : <button onClick={() => setShowPassModal(true)}
            style={{ fontSize: 12, padding: "5px 10px", borderRadius: 7, border: "1px solid #ddd", background: "#f9f9f9", cursor: "pointer", color: "#888" }}>Admin</button>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar por palavra-chave..."
          style={{ flex: 1, minWidth: 180, padding: "9px 14px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14 }} />
        <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)}
          style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14 }}>
          <option value="Todos">Todos os tipos</option>
          {TIPOS.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={filterTransacao} onChange={e => setFilterTransacao(e.target.value)}
          style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14 }}>
          <option value="Todos">Venda e Locação</option>
          {TRANSACOES.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      {loading && <div style={{ textAlign: "center", color: "#888", padding: "4rem 0" }}>Carregando...</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", color: "#888", padding: "4rem 0", fontSize: 15 }}>
          {imoveis.length === 0 ? "Nenhum imóvel cadastrado ainda." : "Nenhum imóvel encontrado."}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
        {filtered.map(im => (
          <div key={im.id} style={{ background: "#fff", border: "1px solid #e5e5e5", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div onClick={() => openDetalhe(im)} style={{ height: 160, background: "#f4f4f4", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: "pointer" }}>
              {im.fotos?.[0] ? <img src={im.fotos[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 52 }}>🏠</span>}
            </div>
            <div style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
                {im.tipo && <span style={{ fontSize: 11, background: "#e8f5f0", color: "#1D9E75", borderRadius: 6, padding: "2px 8px" }}>{im.tipo}</span>}
                {im.transacao && <span style={{ fontSize: 11, background: im.transacao === "Venda" ? "#e8f0ff" : "#fff3e0", color: im.transacao === "Venda" ? "#3a5fd9" : "#e07b00", borderRadius: 6, padding: "2px 8px" }}>{im.transacao}</span>}
              </div>
              {im.titulo && <p style={{ margin: "0 0 2px", fontWeight: 500, fontSize: 15 }}>{im.titulo}</p>}
              {(im.bairro || im.cidade) && <p style={{ margin: "0 0 4px", fontSize: 12, color: "#777" }}>📍 {[im.bairro, im.cidade].filter(Boolean).join(", ")}</p>}
              {im.transacao === "Locação" && im.valorFinal
                ? <p style={{ margin: "0 0 8px", fontWeight: 500, fontSize: 16, color: "#1D9E75" }}>{formatBRL(im.valorFinal)}<span style={{ fontSize: 11, fontWeight: 400 }}>/mês</span></p>
                : im.preco && <p style={{ margin: "0 0 8px", fontWeight: 500, fontSize: 16, color: "#1D9E75" }}>{formatBRL(im.preco)}</p>}
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => openDetalhe(im)} style={{ flex: 1, padding: "6px 0", fontSize: 12, borderRadius: 7, border: "1px solid #ddd", background: "#f9f9f9", cursor: "pointer" }}>Ver ficha</button>
                {isAdmin && <>
                  <button onClick={() => edit(im)} style={{ padding: "6px 10px", fontSize: 12, borderRadius: 7, border: "1px solid #ddd", background: "#f9f9f9", cursor: "pointer" }}>✏️</button>
                  <button onClick={() => del(im.id)} style={{ padding: "6px 10px", fontSize: 12, borderRadius: 7, border: "1px solid #fdd", background: "#fff5f5", cursor: "pointer" }}>🗑️</button>
                </>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── FORMULÁRIO ──
  if (view === "form" && isAdmin) return (
    <div style={{ fontFamily: "sans-serif", padding: "1rem", maxWidth: 680, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.5rem" }}>
        <button onClick={() => setView("lista")} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer" }}>←</button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>{form.id ? "Editar imóvel" : "Novo imóvel"}</h2>
      </div>

      {section("📋 Informações gerais", <>
        {inp("Título *", "titulo", { ph: "Ex: Casa 3 quartos Setor Sul" })}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {sel("Tipo de imóvel", "tipo", TIPOS)}
          {sel("Tipo de transação", "transacao", TRANSACOES)}
        </div>
        {inp("Metragem (m²)", "metragem", { type: "number", ph: "Ex: 200" })}
        {inp("Metragem total do terreno (m²)", "metragemTotal", { type: "number", ph: "Ex: 360" })}
        {tog("Em condomínio?", "condominio")}
        {form.condominio && <>
          {inp("Nome do condomínio", "nomeCondominio", { ph: "Ex: Residencial Verde" })}
          {inp("Valor mensal do condomínio (R$)", "valorCondominioMensal", { type: "number", ph: "Ex: 350" })}
        </>}
      </>)}

      {section("💳 Condições comerciais", <>
        {CONDICOES.map(c => (
          <div key={c}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer", marginBottom: 8 }}>
              <input type="checkbox" checked={form.condicoes?.includes(c) || false} onChange={() => toggleCondicao(c)} style={{ width: 16, height: 16 }} />
              {c}
            </label>
            {c === "Permuta" && form.condicoes?.includes("Permuta") && (
              <input value={form.permuta || ""} onChange={e => sf("permuta", e.target.value)}
                placeholder="Descreva o que aceita em permuta..."
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, boxSizing: "border-box", marginBottom: 8 }} />
            )}
          </div>
        ))}
      </>)}

      {section("📍 Localização", <>
        {inp("Cidade", "cidade", { ph: "Ex: Goiânia" })}
        {inp("Bairro", "bairro", { ph: "Ex: Setor Sul" })}
        {inp("Endereço (visível só para admin)", "endereco", { ph: "Ex: Rua das Flores, 123" })}
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 5 }}>📍 Link do Google Maps</label>
          <input value={form.mapsLink || ""} onChange={e => sf("mapsLink", e.target.value)} placeholder="Cole aqui o link do Google Maps"
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box" }} />
          {form.mapsLink && <a href={form.mapsLink} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "#1D9E75", textDecoration: "none" }}>🔗 Verificar link →</a>}
        </div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {tog("Asfalto", "asfalto")}
          {tog("Água", "agua")}
          {tog("Esgoto", "esgoto")}
        </div>
      </>)}

      {(form.tipo === "Lote" || form.tipo === "Área") && section("🏗️ Detalhes do " + form.tipo, <>
        {sel("Declive", "declive", ["Plano", "Lateral", "Fundo", "Frente"])}
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 8 }}>
          {tog("Muro", "muro")}
          {tog("Esquina", "esquina")}
          {tog("Retangular", "retangular")}
        </div>
        {form.retangular ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {inp("Frente (m)", "frente", { type: "number" })}
            {inp("Laterais (m)", "laterais", { type: "number" })}
          </div>
        ) : inp("Medidas", "medidas", { ph: "Ex: 15x30 irregular" })}
      </>)}

      {(form.tipo === "Casa" || form.tipo === "Apartamento") && section("🏠 Detalhes da " + form.tipo, <>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {inp("Quartos", "quartos", { type: "number" })}
          {inp("Suítes", "suites", { type: "number" })}
          {inp("Valor de avaliação (R$)", "valorAvaliacao", { type: "number" })}
          {inp("Valor de entrada (R$)", "valorEntrada", { type: "number" })}
          {form.tipo === "Apartamento" && inp("Valor do condomínio (R$)", "valorCondominio", { type: "number" })}
        </div>
      </>)}

      {form.transacao === "Locação" && section("🔑 Valores de locação", <>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {inp("Valor do aluguel (R$)", "valorAluguel", { type: "number" })}
          {inp("Condomínio (R$)", "valorCondominio", { type: "number" })}
          {inp("IPTU (R$)", "valorIPTU", { type: "number" })}
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "#1D9E75", fontWeight: 500 }}>
          💰 Valor total: {formatBRL(valorFinalLocacao()) || "—"}
        </p>
      </>)}

      {form.transacao === "Venda" && section("💰 Valor", <>
        {inp("Preço de venda (R$)", "preco", { type: "number", ph: "Ex: 350000" })}
      </>)}

      {section("📝 Descrição", <>
        <textarea value={form.descricao || ""} onChange={e => sf("descricao", e.target.value)}
          placeholder="Descreva o imóvel..." rows={5}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box", resize: "vertical", lineHeight: 1.6 }} />
      </>)}

      {section("👤 Proprietário (visível só para admin)", <>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {inp("Nome do proprietário", "nomeProprietario")}
          {inp("Telefone do proprietário", "telefoneProprietario")}
        </div>
      </>)}

      {section("🤝 Captador", <>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {inp("Nome do captador", "nomeCaptador")}
          {inp("Telefone do captador", "telefoneCaptador")}
        </div>
      </>)}

      {section("📢 Onde foi anunciado (visível só para admin)", <>
        {CANAIS.map(canal => {
          const info = form.anuncios?.[canal];
          return (
            <div key={canal} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1 }}>
                <input type="checkbox" checked={!!info?.ativo} onChange={() => toggleAnuncio(canal)} style={{ width: 16, height: 16 }} />
                <span style={{ fontSize: 14 }}>{canal}</span>
              </label>
              {info?.ativo && <span style={{ fontSize: 12, color: "#888" }}>📅 {info.data}</span>}
            </div>
          );
        })}
      </>)}

      {section("📷 Fotos", <>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={addFotos} style={{ display: "none" }} />
        <button onClick={() => fileRef.current.click()} disabled={uploadingFotos}
          style={{ padding: "9px 18px", borderRadius: 8, border: "1px dashed #bbb", background: uploadingFotos ? "#f0f0f0" : "#fafafa", cursor: uploadingFotos ? "default" : "pointer", fontSize: 13 }}>
          {uploadingFotos ? "⏳ Enviando fotos..." : "+ Adicionar fotos"}
        </button>
        {form.fotos?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {form.fotos.map((f, i) => (
              <div key={i} style={{ position: "relative" }}>
                <img src={f} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid #ddd" }} />
                <button onClick={() => removeFoto(i)} style={{ position: "absolute", top: -7, right: -7, background: "#E24B4A", color: "#fff", border: "none", borderRadius: "50%", width: 22, height: 22, fontSize: 13, cursor: "pointer", lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>
        )}
      </>)}

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button onClick={() => setView("lista")} style={{ flex: 1, padding: "11px 0", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 14 }}>Cancelar</button>
        <button onClick={save} disabled={saving || uploadingFotos}
          style={{ flex: 2, padding: "11px 0", borderRadius: 8, border: "none", background: (saving || uploadingFotos) ? "#aaa" : "#1D9E75", color: "#fff", cursor: (saving || uploadingFotos) ? "default" : "pointer", fontSize: 14, fontWeight: 500 }}>
          {saving ? "Salvando..." : uploadingFotos ? "Aguarde o upload..." : "Salvar imóvel"}
        </button>
      </div>
    </div>
  );

  // ── DETALHE ──
  if (view === "detalhe") {
    const im = imoveis.find(i => i.id === selected?.id) || selected;
    const row = (label, val) => val ? (
      <div style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 14 }}>
        <span style={{ color: "#888", minWidth: 140 }}>{label}</span>
        <span style={{ color: "#333", fontWeight: 500 }}>{val}</span>
      </div>
    ) : null;

    return (
      <div style={{ fontFamily: "sans-serif", padding: "1rem", maxWidth: 680, margin: "0 auto" }}>
        <Lightbox />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1rem" }}>
          <button onClick={() => setView("lista")} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer" }}>←</button>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, flex: 1 }}>{im.titulo || "Ficha do imóvel"}</h2>
          {isAdmin && <button onClick={() => edit(im)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 13 }}>✏️ Editar</button>}
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: "1rem", flexWrap: "wrap" }}>
          {im.tipo && <span style={{ fontSize: 12, background: "#e8f5f0", color: "#1D9E75", borderRadius: 6, padding: "3px 10px" }}>{im.tipo}</span>}
          {im.transacao && <span style={{ fontSize: 12, background: im.transacao === "Venda" ? "#e8f0ff" : "#fff3e0", color: im.transacao === "Venda" ? "#3a5fd9" : "#e07b00", borderRadius: 6, padding: "3px 10px" }}>{im.transacao}</span>}
          {im.condominio && <span style={{ fontSize: 12, background: "#f0f0f0", color: "#555", borderRadius: 6, padding: "3px 10px" }}>Condomínio{im.nomeCondominio ? `: ${im.nomeCondominio}` : ""}</span>}
          {im.condicoes?.map(c => <span key={c} style={{ fontSize: 12, background: "#e8f5f0", color: "#1D9E75", borderRadius: 6, padding: "3px 10px" }}>✅ {c}</span>)}
        </div>

        {im.fotos?.length > 0 ? (
          <div style={{ marginBottom: "1.2rem" }}>
            <img src={im.fotos[fotoIdx]} alt="" onClick={() => setLightbox(im.fotos[fotoIdx])}
              style={{ width: "100%", maxHeight: 400, objectFit: "contain", borderRadius: 12, border: "1px solid #eee", cursor: "zoom-in", background: "#f4f4f4" }} />
            {im.fotos.length > 1 && (
              <div style={{ display: "flex", gap: 8, marginTop: 8, overflowX: "auto" }}>
                {im.fotos.map((f, i) => (
                  <img key={i} src={f} onClick={() => setFotoIdx(i)} alt=""
                    style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, cursor: "pointer", flexShrink: 0, border: i === fotoIdx ? "2px solid #1D9E75" : "1px solid #ddd" }} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ height: 180, background: "#f4f4f4", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60, marginBottom: "1.2rem" }}>🏠</div>
        )}

        {im.transacao === "Locação"
          ? <div style={{ marginBottom: "1rem" }}>
              {row("Aluguel", formatBRL(im.valorAluguel))}
              {row("Condomínio", formatBRL(im.valorCondominio))}
              {row("IPTU", formatBRL(im.valorIPTU))}
              {im.valorFinal && <p style={{ fontSize: 20, fontWeight: 500, color: "#1D9E75", margin: "8px 0" }}>💰 Total: {formatBRL(im.valorFinal)}/mês</p>}
            </div>
          : im.preco && <p style={{ fontSize: 24, fontWeight: 500, color: "#1D9E75", margin: "0 0 1rem" }}>{formatBRL(im.preco)}</p>}

        {im.condicoes?.length > 0 && section("💳 Condições comerciais", <>
          {im.condicoes.map(c => (
            <div key={c} style={{ fontSize: 14, marginBottom: 4 }}>
              ✅ {c}{c === "Permuta" && im.permuta ? `: ${im.permuta}` : ""}
            </div>
          ))}
        </>)}

        {(im.cidade || im.bairro) && section("📍 Localização", <>
          {row("Cidade", im.cidade)}
          {row("Bairro", im.bairro)}
          {isAdmin && row("Endereço", im.endereco)}
          {row("Asfalto", im.asfalto ? "Sim" : null)}
          {row("Água", im.agua ? "Sim" : null)}
          {row("Esgoto", im.esgoto ? "Sim" : null)}
          {im.mapsLink && (
            <a href={im.mapsLink} target="_blank" rel="noreferrer"
              style={{ display: "inline-block", marginTop: 8, padding: "8px 18px", background: "#1D9E75", color: "#fff", borderRadius: 8, fontSize: 14, textDecoration: "none", fontWeight: 500 }}>
              🗺️ Ver no Google Maps
            </a>
          )}
        </>)}

        {section("📐 Características", <>
          {row("Metragem", im.metragem ? im.metragem + " m²" : null)}
          {row("Metragem total", im.metragemTotal ? im.metragemTotal + " m²" : null)}
          {im.condominio && row("Condomínio mensal", formatBRL(im.valorCondominioMensal))}
          {(im.tipo === "Lote" || im.tipo === "Área") && <>
            {row("Declive", im.declive)}
            {row("Muro", im.muro ? "Sim" : "Não")}
            {row("Esquina", im.esquina ? "Sim" : "Não")}
            {row("Retangular", im.retangular ? "Sim" : "Não")}
            {im.retangular ? <>
              {row("Frente", im.frente ? im.frente + " m" : null)}
              {row("Laterais", im.laterais ? im.laterais + " m" : null)}
            </> : row("Medidas", im.medidas)}
          </>}
          {(im.tipo === "Casa" || im.tipo === "Apartamento") && <>
            {row("Quartos", im.quartos)}
            {row("Suítes", im.suites)}
            {row("Valor de avaliação", formatBRL(im.valorAvaliacao))}
            {row("Valor de entrada", formatBRL(im.valorEntrada))}
            {im.tipo === "Apartamento" && row("Condomínio", formatBRL(im.valorCondominio))}
          </>}
        </>)}

        {im.descricao && section("📝 Descrição", <p style={{ fontSize: 14, color: "#444", lineHeight: 1.75, margin: 0, whiteSpace: "pre-wrap" }}>{im.descricao}</p>)}

        {(im.nomeCaptador || im.telefoneCaptador) && section("🤝 Captador", <>
          {row("Nome", im.nomeCaptador)}
          {row("Telefone", im.telefoneCaptador)}
        </>)}

        {isAdmin && (im.nomeProprietario || im.telefoneProprietario) && section("👤 Proprietário", <>
          {row("Nome", im.nomeProprietario)}
          {row("Telefone", im.telefoneProprietario)}
        </>)}

        {isAdmin && Object.values(im.anuncios || {}).some(a => a?.ativo) && section("📢 Anúncios", <>
          {CANAIS.filter(c => im.anuncios?.[c]?.ativo).map(c => (
            <div key={c} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
              <span>✅ {c}</span>
              <span style={{ color: "#888" }}>{im.anuncios[c].data}</span>
            </div>
          ))}
        </>)}

        <p style={{ fontSize: 13, fontWeight: 500, color: "#555", margin: "1rem 0 8px" }}>📲 Compartilhar via WhatsApp</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <button onClick={() => whatsappDescricao(im)}
            style={{ flex: 1, minWidth: 140, padding: "11px 0", borderRadius: 8, border: "none", background: "#25D366", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
            💬 Enviar descrição
          </button>
          <button onClick={() => whatsappMaps(im)}
            style={{ flex: 1, minWidth: 140, padding: "11px 0", borderRadius: 8, border: "none", background: "#128C7E", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
            📍 Enviar localização
          </button>
        </div>
        <button onClick={() => downloadFotos(im)}
          style={{ width: "100%", padding: "11px 0", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 14 }}>
          📥 Baixar todas as fotos
        </button>
      </div>
    );
  }

  return null;
}
