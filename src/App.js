import { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, orderBy, query } from "firebase/firestore";

const ADMIN_PASS = "123livre";
const TIPOS = ["Lote", "Casa", "Apartamento", "Área", "Galpão"];
const TRANSACOES = ["Venda", "Locação", "Venda e Locação"];
const ESTADOS_IMOVEL = ["Imóvel Usado", "Imóvel Novo"];
const CANAIS = ["Canal Pro", "Chaves na Mão", "Marketplace Facebook", "Google Business", "Instagram", "Whatsapp", "Grupos"];
const CONDICOES = ["À vista", "Financiamento", "Permuta"];
const RODAPE = "Valores e condições sujeitos a alteração e/ou análise sem aviso prévio e sem ônus ao anunciante.";
const CLOUDINARY_CLOUD = "demsusjwf";
const CLOUDINARY_PRESET = "Estoque";
const LOGO_URL = "https://res.cloudinary.com/demsusjwf/image/upload/v1778785144/logo_png_fuv27j.png";

const PDF_CAMPOS = [
  { key: "tipo", label: "Tipo/Transação" },
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

const COR = {
  primary: "#C0392B",
  primaryDark: "#922B21",
  primaryLight: "#FADBD8",
  primaryBorder: "#E59A94",
};

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

function formatTel(v) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

function gerarDescricao(form) {
  const isLote = form.tipo === "Lote" || form.tipo === "Área";
  const linhas = [];
  if (form.titulo) linhas.push(form.titulo);
  linhas.push("");
  if (form.bairro) linhas.push(form.bairro.toUpperCase());
  linhas.push("");
  if (form.metragem) linhas.push(`- ${form.metragem} m² de construção`);
  if (form.metragemTotal) linhas.push(`- ${form.metragemTotal} m² de terreno`);
  const q = parseInt(form.quartos) || 0;
  const s = parseInt(form.suites) || 0;
  const g = parseInt(form.garagens) || 0;
  if (q > 0) linhas.push(`- ${q} quarto${q > 1 ? "s" : ""}${s > 0 ? `, sendo ${s} suíte${s > 1 ? "s" : ""}` : ""}`);
  else if (s > 0) linhas.push(`- ${s} suíte${s > 1 ? "s" : ""}`);
  if (g > 0) linhas.push(`- ${g} garagem${g > 1 ? "s" : ""}`);
  if (isLote) {
    if (form.asfalto) linhas.push("- Asfalto");
    if (form.agua) linhas.push("- Água");
    if (form.esgoto) linhas.push("- Esgoto");
    if (form.declive === "Plano") linhas.push("- Plano");
    else if (form.declive) linhas.push(`- Declive: ${form.declive}`);
    if (form.muro) linhas.push("- Murado");
    if (form.esquina) linhas.push("- Esquina");
    if (form.retangular && form.frente && form.laterais) linhas.push(`- ${form.frente}x${form.laterais} m`);
    else if (form.medidas) linhas.push(`- ${form.medidas}`);
  }
  if (form.condominio && form.nomeCondominio) linhas.push(`- Condomínio: ${form.nomeCondominio}`);
  if (form.estadoImovel === "Imóvel Novo") linhas.push(`- ${form.estadoImovel}`);
  if (form.extras) linhas.push(...form.extras.split("\n").filter(Boolean).map(l => l.startsWith("-") ? l : `- ${l}`));
  linhas.push("");
  const isLocacao = form.transacao === "Locação" || form.transacao === "Venda e Locação";
  const isVenda = form.transacao === "Venda" || form.transacao === "Venda e Locação";
  if (isVenda && parseFloat(form.preco)) {
    linhas.push(`Venda: ${formatBRL(form.preco)}`);
    if (parseFloat(form.valorAvaliacao)) linhas.push(`Avaliado em ${formatBRL(form.valorAvaliacao)}`);
    if (parseFloat(form.valorEntrada)) linhas.push(`Entrada: ${formatBRL(form.valorEntrada)}`);
  }
  if (isLocacao) {
    const a = parseFloat(form.valorAluguel) || 0;
    const c = parseFloat(form.valorCondominio) || 0;
    const ip = parseFloat(form.valorIPTU) || 0;
    if (a) linhas.push(`Aluguel: ${formatBRL(a)}`);
    if (c) linhas.push(`Condomínio: ${formatBRL(c)}/mês`);
    if (ip) linhas.push(`IPTU: ${formatBRL(ip)}/mês`);
    const total = a + c + ip;
    if (total) linhas.push(`Total locação: ${formatBRL(total)}/mês`);
  }
  if (form.condicoes?.length) {
    const conds = form.condicoes.map(c => c === "Permuta" && form.permuta ? `Permuta (${form.permuta})` : c);
    linhas.push(conds.join(", "));
  }
  if (form.condominio && parseFloat(form.valorCondominioMensal)) linhas.push(`Condomínio: ${formatBRL(form.valorCondominioMensal)}/mês`);
  linhas.push("");
  linhas.push(RODAPE);
  return linhas.join("\n");
}

function gerarPDF(imoveis, camposSel) {
  const has = k => camposSel.includes(k);
  const isLote = im => im.tipo === "Lote" || im.tipo === "Área";
  const rows = imoveis.map(im => {
    const total = (parseFloat(im.valorAluguel)||0)+(parseFloat(im.valorCondominio)||0)+(parseFloat(im.valorIPTU)||0);
    return `<tr>
      ${has("tipo") ? `<td>${im.tipo||""} / ${im.transacao||""}</td>` : ""}
      ${has("cidade") ? `<td>${im.cidade||""}</td>` : ""}
      ${has("bairro") ? `<td>${im.bairro||""}</td>` : ""}
      ${has("maps") ? `<td>${im.mapsLink ? `<a href="${im.mapsLink}">Ver mapa</a>` : ""}</td>` : ""}
      ${has("metragem") ? `<td>${im.metragem ? im.metragem+" m²" : ""}</td>` : ""}
      ${has("terreno") ? `<td>${im.metragemTotal ? im.metragemTotal+" m²" : ""}</td>` : ""}
      ${has("quartos") ? `<td>${im.quartos||""}</td>` : ""}
      ${has("suites") ? `<td>${im.suites||""}</td>` : ""}
      ${has("garagens") ? `<td>${im.garagens||""}</td>` : ""}
      ${has("asfalto") ? `<td>${isLote(im) ? (im.asfalto?"Sim":"Não") : ""}</td>` : ""}
      ${has("agua") ? `<td>${isLote(im) ? (im.agua?"Sim":"Não") : ""}</td>` : ""}
      ${has("esgoto") ? `<td>${isLote(im) ? (im.esgoto?"Sim":"Não") : ""}</td>` : ""}
      ${has("muro") ? `<td>${isLote(im) ? (im.muro?"Sim":"Não") : ""}</td>` : ""}
      ${has("medidas") ? `<td>${isLote(im) ? (im.retangular&&im.frente&&im.laterais?`${im.frente}x${im.laterais}m`:(im.medidas||"")) : ""}</td>` : ""}
      ${has("preco") ? `<td>${im.transacao==="Locação"?(formatBRL(im.valorAluguel)||""):im.transacao==="Venda e Locação"?[formatBRL(im.preco),formatBRL(im.valorAluguel)].filter(Boolean).join(" / "):(formatBRL(im.preco)||"")}</td>` : ""}
      ${has("condominio") ? `<td>${formatBRL(im.valorCondominio)||""}</td>` : ""}
      ${has("iptu") ? `<td>${formatBRL(im.valorIPTU)||""}</td>` : ""}
      ${has("total") ? `<td>${total>0?formatBRL(total):""}</td>` : ""}
    </tr>`;
  }).join("");
  const headers = PDF_CAMPOS.filter(c => has(c.key)).map(c => `<th>${c.label}</th>`).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Lista de Imóveis</title>
  <style>body{font-family:Arial,sans-serif;font-size:10px;padding:16px}h2{color:${COR.primary}}table{width:100%;border-collapse:collapse}th{background:${COR.primary};color:#fff;padding:5px 7px;text-align:left;font-size:9px}td{border:1px solid #ddd;padding:4px 7px;vertical-align:top}tr:nth-child(even) td{background:#fdf5f5}a{color:${COR.primary}}@media print{body{padding:0}@page{size:A4 landscape;margin:10mm}}</style>
  </head><body>
  <h2>Lista de Imóveis</h2><p style="color:#666;font-size:11px">Gerado em ${new Date().toLocaleDateString("pt-BR")} — ${imoveis.length} imóvel(is)</p>
  <table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
  const w = window.open("", "_blank");
  w.document.write(html); w.document.close();
  setTimeout(() => w.print(), 500);
}

const emptyForm = {
  id: null, titulo: "", tipo: "Casa", transacao: "Venda", estadoImovel: "Imóvel Usado",
  preco: "", descricao: "", extras: "", mapsLink: "",
  cep: "", cidade: "", bairro: "", endereco: "", asfalto: false, agua: false, esgoto: false,
  metragem: "", metragemTotal: "", nomeProprietario: "", telefoneProprietario: "",
  nomeCaptador: "", telefoneCaptador: "", condominio: false, nomeCondominio: "", valorCondominioMensal: "",
  declive: "Plano", muro: false, esquina: false, retangular: false, frente: "", laterais: "", medidas: "",
  quartos: "", suites: "", garagens: "", valorAvaliacao: "", valorEntrada: "", valorCondominio: "",
  valorAluguel: "", valorIPTU: "", condicoes: [], permuta: "", anuncios: {}, fotos: [],
};

async function uploadToCloudinary(file) {
  const fd = new FormData();
  fd.append("file", file); fd.append("upload_preset", CLOUDINARY_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: "POST", body: fd });
  const data = await res.json();
  if (!data.secure_url) throw new Error("Falha no upload");
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
  const [filterEstado, setFilterEstado] = useState("Todos");
  const [filterCidade, setFilterCidade] = useState("Todas");
  const [lightbox, setLightbox] = useState(null);
  const [lightboxFotos, setLightboxFotos] = useState([]);
  const [history, setHistory] = useState(["lista"]);
  const [aFiltroTipo, setAFiltroTipo] = useState("Todos");
  const [aFiltroTransacao, setAFiltroTransacao] = useState("Todos");
  const [aFiltroCidade, setAFiltroCidade] = useState("Todas");
  const [aFiltroCanal, setAFiltroCanal] = useState("Todos");
  const [showPDFModal, setShowPDFModal] = useState(false);
  const [pdfCampos, setPdfCampos] = useState(PDF_CAMPOS.map(c => c.key));
  const fileRef = useRef();

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#galeria-")) {
      const id = hash.replace("#galeria-", "");
      setSelected({ id }); setView("galeria"); setHistory(["galeria"]);
    }
  }, []);

  useEffect(() => {
    const q = query(collection(db, "imoveis"), orderBy("createdAt", "desc"));
    return onSnapshot(q, snap => { setImoveis(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); }, () => setLoading(false));
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (lightbox === null) return;
    if (e.key === "ArrowRight") setLightbox(i => (i + 1) % lightboxFotos.length);
    if (e.key === "ArrowLeft") setLightbox(i => (i - 1 + lightboxFotos.length) % lightboxFotos.length);
    if (e.key === "Escape") setLightbox(null);
  }, [lightbox, lightboxFotos]);

  useEffect(() => { window.addEventListener("keydown", handleKeyDown); return () => window.removeEventListener("keydown", handleKeyDown); }, [handleKeyDown]);

  const navigate = (v) => { setView(v); setHistory(h => [...h, v]); };
  const goBack = () => {
    if (history.length <= 1) { setView("lista"); setHistory(["lista"]); return; }
    setHistory(h => h.slice(0, -1)); setView(history[history.length - 2]);
  };
  const openLightbox = (fotos, idx) => { setLightboxFotos(fotos); setLightbox(idx); };
  const sf = (key, val) => setForm(p => ({ ...p, [key]: val }));
  const valorFinalLocacao = () => (parseFloat(form.valorAluguel)||0)+(parseFloat(form.valorCondominio)||0)+(parseFloat(form.valorIPTU)||0)||"";
  const toggleCondicao = (c) => setForm(p => ({ ...p, condicoes: p.condicoes?.includes(c) ? p.condicoes.filter(x => x !== c) : [...(p.condicoes||[]), c] }));
  const handleLogin = () => { if (passInput === ADMIN_PASS) { setIsAdmin(true); setShowPassModal(false); setPassInput(""); setPassError(false); } else setPassError(true); };

  const save = async () => {
    if (!form.titulo) return alert("Preencha o título.");
    setSaving(true);
    try {
      const { id, ...data } = form;
      const isLocacao = form.transacao === "Locação" || form.transacao === "Venda e Locação";
      if (isLocacao) data.valorFinal = valorFinalLocacao();
      if (id) await updateDoc(doc(db, "imoveis", id), data);
      else await addDoc(collection(db, "imoveis"), { ...data, createdAt: Date.now() });
      goBack();
    } catch (e) { alert("Erro: " + e.message); }
    setSaving(false);
  };

  const del = async (id) => { if (!window.confirm("Excluir?")) return; await deleteDoc(doc(db, "imoveis", id)); goBack(); };
  const edit = (im) => { setForm({ ...emptyForm, ...im }); navigate("form"); };
  const openDetalhe = (im) => { setSelected(im); setFotoIdx(0); navigate("detalhe"); };

  const buscarCEP = (raw) => {
    const c = raw.replace(/\D/g, "");
    if (c.length !== 8) return;
    const cbName = `cep_cb_${Date.now()}`;
    window[cbName] = (data) => {
      delete window[cbName];
      document.getElementById(cbName)?.remove();
      if (data && !data.erro) {
        setForm(p => ({
          ...p,
          endereco: [data.logradouro, data.complemento].filter(Boolean).join(", ") || p.endereco,
          bairro: data.bairro || p.bairro,
          cidade: data.localidade || p.cidade,
        }));
      }
    };
    const s = document.createElement("script");
    s.id = cbName;
    s.src = `https://viacep.com.br/ws/${c}/json/?callback=${cbName}`;
    s.onerror = () => { delete window[cbName]; s.remove(); };
    document.head.appendChild(s);
  };

  const addFotos = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploadingFotos(true);
    try { const urls = await Promise.all(files.map(f => uploadToCloudinary(f))); setForm(p => ({ ...p, fotos: [...(p.fotos||[]), ...urls] })); }
    catch (err) { alert("Erro upload: " + err.message); }
    setUploadingFotos(false); e.target.value = "";
  };

  const removeFoto = (i) => setForm(p => ({ ...p, fotos: p.fotos.filter((_, idx) => idx !== i) }));

  const descricaoCompleta = (im) => {
    const desc = im.descricao || "";
    if (desc.includes(RODAPE)) return desc;
    return desc + (desc ? "\n\n" : "") + RODAPE;
  };

  const whatsappDescricao = (im) => window.open("https://wa.me/?text=" + encodeURIComponent(descricaoCompleta(im)), "_blank");
  const whatsappMaps = (im) => { if (!im.mapsLink) return alert("Sem link do Maps."); window.open("https://wa.me/?text=" + encodeURIComponent(`Localização do imóvel:\n${im.mapsLink}`), "_blank"); };
  const whatsappFotos = (im) => {
    if (!im.fotos?.length) return alert("Sem fotos.");
    const link = `${window.location.origin}${window.location.pathname}#galeria-${im.id}`;
    window.open("https://wa.me/?text=" + encodeURIComponent(`Fotos do imóvel:\n${link}`), "_blank");
  };
  const whatsappTudo = (im) => {
    const galeriaLink = `${window.location.origin}${window.location.pathname}#galeria-${im.id}`;
    const txt = descricaoCompleta(im) +
      (im.fotos?.length ? `\n\nFotos:\n${galeriaLink}` : "") +
      (im.mapsLink ? `\n\nLocalização:\n${im.mapsLink}` : "");
    window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
  };

  const downloadFotos = async (im) => {
    if (!im.fotos?.length) return alert("Sem fotos.");
    for (let i = 0; i < im.fotos.length; i++) {
      try { const res = await fetch(im.fotos[i]); const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${im.titulo||"imovel"}_foto${i+1}.jpg`; a.click(); URL.revokeObjectURL(url); await new Promise(r => setTimeout(r, 300)); } catch {}
    }
  };

  const toggleAnuncio = (canal) => {
    const atual = form.anuncios?.[canal];
    setForm(p => ({ ...p, anuncios: { ...p.anuncios, [canal]: atual ? null : { ativo: true, data: new Date().toLocaleDateString("pt-BR") } } }));
  };

  const toggleAnuncioImovel = async (im, canal) => {
    const atual = im.anuncios?.[canal];
    const novoAnuncios = { ...(im.anuncios||{}), [canal]: atual ? null : { ativo: true, data: new Date().toLocaleDateString("pt-BR") } };
    try { await updateDoc(doc(db, "imoveis", im.id), { anuncios: novoAnuncios }); } catch (e) { alert("Erro: " + e.message); }
  };

  const cidades = ["Todas", ...Array.from(new Set(imoveis.map(im => im.cidade).filter(Boolean))).sort()];

  const matchTransacao = (im, filtro) => {
    if (filtro === "Todos") return true;
    if (im.transacao === "Venda e Locação") return filtro === "Venda" || filtro === "Locação" || filtro === "Venda e Locação";
    return im.transacao === filtro;
  };

  const filtered = imoveis.filter(im => {
    const q = search.toLowerCase();
    return (!q || (im.titulo||"").toLowerCase().includes(q)||(im.descricao||"").toLowerCase().includes(q)||(im.cidade||"").toLowerCase().includes(q)||(im.bairro||"").toLowerCase().includes(q))
      && (filterTipo === "Todos" || im.tipo === filterTipo)
      && matchTransacao(im, filterTransacao)
      && (filterEstado === "Todos" || im.estadoImovel === filterEstado)
      && (filterCidade === "Todas" || im.cidade === filterCidade);
  });

  const anunciosFiltrados = imoveis.filter(im => {
    let matchCanal = true;
    if (aFiltroCanal === "Todos") matchCanal = true;
    else if (aFiltroCanal === "Anunciado") matchCanal = CANAIS.some(c => im.anuncios?.[c]?.ativo);
    else if (aFiltroCanal === "Não anunciado") matchCanal = !CANAIS.some(c => im.anuncios?.[c]?.ativo);
    else if (aFiltroCanal.startsWith("nao_")) matchCanal = !im.anuncios?.[aFiltroCanal.replace("nao_", "")]?.ativo;
    else if (aFiltroCanal.startsWith("sim_")) matchCanal = !!im.anuncios?.[aFiltroCanal.replace("sim_", "")]?.ativo;
    return (aFiltroTipo === "Todos" || im.tipo === aFiltroTipo)
      && matchTransacao(im, aFiltroTransacao)
      && (aFiltroCidade === "Todas" || im.cidade === aFiltroCidade)
      && matchCanal;
  });

  const inp = (label, key, opts = {}) => (
    <div style={{ marginBottom: "1rem" }}>
      <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 4 }}>{label}</label>
      <input type={opts.type||"text"} value={form[key]||""} onChange={e => sf(key, e.target.value)} placeholder={opts.ph||""}
        style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box" }} />
    </div>
  );
  const inpTel = (label, key) => (
    <div style={{ marginBottom: "1rem" }}>
      <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 4 }}>{label}</label>
      <input type="tel" value={form[key]||""} onChange={e => sf(key, formatTel(e.target.value))} placeholder="(62) 9 9999-9999"
        style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box" }} />
    </div>
  );
  const tog = (label, key) => (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer", marginBottom: 8 }}>
      <input type="checkbox" checked={!!form[key]} onChange={e => sf(key, e.target.checked)} style={{ width: 16, height: 16, accentColor: COR.primary }} />{label}
    </label>
  );
  const sel = (label, key, opts) => (
    <div style={{ marginBottom: "1rem" }}>
      <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 4 }}>{label}</label>
      <select value={form[key]||opts[0]} onChange={e => sf(key, e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14 }}>
        {opts.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
  const section = (title, children) => (
    <div style={{ background: "#fdf5f5", borderRadius: 10, padding: "1rem", marginBottom: "1rem", border: `1px solid ${COR.primaryBorder}` }}>
      <p style={{ margin: "0 0 12px", fontWeight: 500, fontSize: 14, color: COR.primaryDark }}>{title}</p>
      {children}
    </div>
  );
  const BackBtn = ({ label = "Voltar" }) => (
    <button onClick={goBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", fontSize: 15, cursor: "pointer", color: COR.primary, fontWeight: 500, padding: 0 }}>← {label}</button>
  );
  const btnPrimary = { background: COR.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 500, fontSize: 14 };
  const btnOutline = { background: "#fff", color: COR.primary, border: `1px solid ${COR.primary}`, borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontWeight: 500, fontSize: 13 };

  const Lightbox = () => {
    if (lightbox === null || !lightboxFotos?.length) return null;
    const prev = (e) => { e.stopPropagation(); setLightbox(i => (i - 1 + lightboxFotos.length) % lightboxFotos.length); };
    const next = (e) => { e.stopPropagation(); setLightbox(i => (i + 1) % lightboxFotos.length); };
    return (
      <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.94)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
        <img src={lightboxFotos[lightbox]} alt="" style={{ maxWidth: "85vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 8 }} onClick={e => e.stopPropagation()} />
        {lightboxFotos.length > 1 && <>
          <button onClick={prev} style={{ position: "absolute", left: 12, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 30, borderRadius: "50%", width: 48, height: 48, cursor: "pointer" }}>‹</button>
          <button onClick={next} style={{ position: "absolute", right: 12, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 30, borderRadius: "50%", width: 48, height: 48, cursor: "pointer" }}>›</button>
          <span style={{ position: "absolute", bottom: 16, color: "#fff", fontSize: 13, background: "rgba(0,0,0,0.5)", padding: "4px 12px", borderRadius: 20 }}>{lightbox+1} / {lightboxFotos.length}</span>
        </>}
        <button onClick={() => setLightbox(null)} style={{ position: "absolute", top: 12, right: 16, background: "none", border: "none", color: "#fff", fontSize: 28, cursor: "pointer" }}>×</button>
      </div>
    );
  };

  const PassModal = () => (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: "2rem", width: 320, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
        {LOGO_URL
          ? <img src={LOGO_URL} alt="Logo" style={{ display: "block", maxHeight: 80, maxWidth: "100%", margin: "0 auto 1rem", objectFit: "contain" }} />
          : <div style={{ width: 64, height: 64, background: COR.primaryLight, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem", fontSize: 28 }}>🏠</div>}
        <h3 style={{ margin: "0 0 1rem", textAlign: "center", color: COR.primaryDark }}>Acesso Admin</h3>
        <input type="password" value={passInput} onChange={e => { setPassInput(e.target.value); setPassError(false); }} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="Senha" autoFocus
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: passError ? `1px solid ${COR.primary}` : "1px solid #ddd", fontSize: 15, boxSizing: "border-box", marginBottom: 8 }} />
        {passError && <p style={{ color: COR.primary, fontSize: 13, margin: "0 0 8px" }}>Senha incorreta.</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { setShowPassModal(false); setPassInput(""); setPassError(false); }} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer" }}>Cancelar</button>
          <button onClick={handleLogin} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", background: COR.primary, color: "#fff", cursor: "pointer", fontWeight: 500 }}>Entrar</button>
        </div>
      </div>
    </div>
  );

  const PDFModal = ({ imoveis }) => {
    const todos = pdfCampos.length === PDF_CAMPOS.length;
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
        <div style={{ background: "#fff", borderRadius: 12, padding: "1.5rem", width: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.2)", maxHeight: "80vh", overflowY: "auto" }}>
          <h3 style={{ margin: "0 0 1rem", fontSize: 17, color: COR.primaryDark }}>Escolha os campos do PDF</h3>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginBottom: 12, fontWeight: 500, color: COR.primary }}>
            <input type="checkbox" checked={todos} onChange={() => setPdfCampos(todos ? [] : PDF_CAMPOS.map(c => c.key))} style={{ width: 15, height: 15, accentColor: COR.primary }} />
            Selecionar todos
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: "1rem" }}>
            {PDF_CAMPOS.map(c => (
              <label key={c.key} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={pdfCampos.includes(c.key)} onChange={() => setPdfCampos(p => p.includes(c.key) ? p.filter(x => x !== c.key) : [...p, c.key])} style={{ width: 15, height: 15, accentColor: COR.primary }} />
                {c.label}
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowPDFModal(false)} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer" }}>Cancelar</button>
            <button onClick={() => { setShowPDFModal(false); gerarPDF(imoveis, pdfCampos); }}
              style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", background: COR.primary, color: "#fff", cursor: "pointer", fontWeight: 500 }}>Gerar PDF</button>
          </div>
        </div>
      </div>
    );
  };

  // ── GALERIA ISOLADA ──
  if (view === "galeria") {
    const im = imoveis.find(i => i.id === selected?.id) || selected;
    return (
      <div style={{ fontFamily: "sans-serif", background: "#111", minHeight: "100vh", padding: "1rem" }}>
        <Lightbox />
        <h2 style={{ margin: "0 0 1rem", fontSize: 18, fontWeight: 500, color: "#fff" }}>{im?.titulo || "Fotos do imóvel"}</h2>
        {im?.fotos?.length > 0
          ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
              {im.fotos.map((f, i) => <img key={i} src={f} alt="" onClick={() => openLightbox(im.fotos, i)} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8, cursor: "zoom-in" }} />)}
            </div>
          : <p style={{ color: "#888", textAlign: "center", padding: "4rem 0" }}>Nenhuma foto encontrada.</p>}
      </div>
    );
  }

  // ── ANÚNCIOS ──
  if (view === "anuncios" && isAdmin) return (
    <div style={{ fontFamily: "sans-serif", padding: "1rem", maxWidth: 1300, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1rem" }}>
        <BackBtn />
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, flex: 1, color: COR.primaryDark }}>Controle de Anúncios</h2>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap" }}>
        <select value={aFiltroTipo} onChange={e => setAFiltroTipo(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13 }}>
          <option value="Todos">Todos os tipos</option>{TIPOS.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={aFiltroTransacao} onChange={e => setAFiltroTransacao(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13 }}>
          <option value="Todos">Venda e Locação</option>{TRANSACOES.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={aFiltroCidade} onChange={e => setAFiltroCidade(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13 }}>
          {cidades.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={aFiltroCanal} onChange={e => setAFiltroCanal(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13 }}>
          <option value="Todos">Todos os canais</option>
          <option value="Anunciado">Com anúncio ativo</option>
          <option value="Não anunciado">Sem anúncio em nenhum canal</option>
          <optgroup label="— Não anunciado em:">
            {CANAIS.map(c => <option key={`nao_${c}`} value={`nao_${c}`}>Falta: {c}</option>)}
          </optgroup>
          <optgroup label="— Anunciado em:">
            {CANAIS.map(c => <option key={`sim_${c}`} value={`sim_${c}`}>Ativo: {c}</option>)}
          </optgroup>
        </select>
        <span style={{ fontSize: 13, color: "#888", alignSelf: "center" }}>{anunciosFiltrados.length} imóvel(is)</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: COR.primary, color: "#fff" }}>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>Tipo</th>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>Cidade</th>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>Bairro</th>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>Preço</th>
              <th style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>Proprietário</th>
              {CANAIS.map(c => <th key={c} style={{ padding: "8px 6px", textAlign: "center", fontSize: 10, whiteSpace: "nowrap" }}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {anunciosFiltrados.length === 0 && <tr><td colSpan={5+CANAIS.length} style={{ textAlign: "center", padding: "2rem", color: "#aaa" }}>Nenhum imóvel encontrado.</td></tr>}
            {anunciosFiltrados.map((im, idx) => {
              const preco = im.transacao === "Locação" ? (im.valorFinal ? formatBRL(im.valorFinal)+"/mês" : "") : formatBRL(im.preco);
              return (
                <tr key={im.id} style={{ background: idx%2===0?"#fff":"#fdf5f5" }}>
                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                    <span style={{ fontSize: 11, background: COR.primaryLight, color: COR.primaryDark, borderRadius: 6, padding: "2px 8px" }}>{im.tipo}</span>
                    {im.transacao && <span style={{ marginLeft: 4, fontSize: 11, background: "#f5f5f5", color: "#555", borderRadius: 6, padding: "2px 8px" }}>{im.transacao}</span>}
                  </td>
                  <td style={{ padding: "8px 10px" }}>{im.cidade||"—"}</td>
                  <td style={{ padding: "8px 10px" }}>{im.bairro||"—"}</td>
                  <td style={{ padding: "8px 10px", color: COR.primary, fontWeight: 500, whiteSpace: "nowrap" }}>{preco||"—"}</td>
                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{im.nomeProprietario||"—"}</td>
                  {CANAIS.map(canal => {
                    const info = im.anuncios?.[canal];
                    return (
                      <td key={canal} style={{ padding: "5px", textAlign: "center" }}>
                        <button onClick={() => toggleAnuncioImovel(im, canal)}
                          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: info?.ativo ? COR.primaryLight : "#f5f5f5", border: info?.ativo ? `1px solid ${COR.primary}` : "1px solid #ddd", borderRadius: 8, padding: "4px 6px", cursor: "pointer", width: "100%", minWidth: 56 }}>
                          <span style={{ fontSize: 14 }}>{info?.ativo ? "✅" : "⬜"}</span>
                          {info?.ativo && <span style={{ fontSize: 9, color: "#888" }}>{info.data}</span>}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ── CONSULTA ──
  if (view === "consulta") return (
    <div style={{ fontFamily: "sans-serif", padding: "1rem", maxWidth: 960, margin: "0 auto" }}>
      <Lightbox />
      {showPDFModal && <PDFModal imoveis={filtered} />}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.2rem" }}>
        <BackBtn />
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, flex: 1, color: COR.primaryDark }}>Consulta de Imóveis</h2>
        {filtered.length > 0 && <button onClick={() => setShowPDFModal(true)} style={{ ...btnPrimary }}>Gerar PDF ({filtered.length})</button>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: "1rem" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." style={{ gridColumn: "1/-1", padding: "9px 14px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14 }} />
        <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14 }}>
          <option value="Todos">Todos os tipos</option>{TIPOS.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={filterTransacao} onChange={e => setFilterTransacao(e.target.value)} style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14 }}>
          <option value="Todos">Todos</option>{TRANSACOES.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14 }}>
          <option value="Todos">Novo e Usado</option>{ESTADOS_IMOVEL.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={filterCidade} onChange={e => setFilterCidade(e.target.value)} style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14 }}>
          {cidades.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      <p style={{ fontSize: 13, color: "#888", margin: "0 0 1rem" }}>{filtered.length} imóvel(is) encontrado(s)</p>
      {filtered.length === 0
        ? <div style={{ textAlign: "center", color: "#aaa", padding: "3rem 0" }}>Nenhum imóvel encontrado.</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map(im => {
              const total = (parseFloat(im.valorAluguel)||0)+(parseFloat(im.valorCondominio)||0)+(parseFloat(im.valorIPTU)||0);
              const isLote = im.tipo === "Lote" || im.tipo === "Área";
              const isLocacao = im.transacao === "Locação" || im.transacao === "Venda e Locação";
              const isVenda = im.transacao === "Venda" || im.transacao === "Venda e Locação";
              return (
                <div key={im.id} style={{ background: "#fff", border: "1px solid #e5e5e5", borderRadius: 12, padding: "1rem", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <div style={{ display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                        {im.tipo && <span style={{ fontSize: 11, background: COR.primaryLight, color: COR.primaryDark, borderRadius: 6, padding: "2px 8px" }}>{im.tipo}</span>}
                        {im.transacao && <span style={{ fontSize: 11, background: "#f5f5f5", color: "#555", borderRadius: 6, padding: "2px 8px" }}>{im.transacao}</span>}
                        {im.estadoImovel && <span style={{ fontSize: 11, background: "#f5f5f5", color: "#555", borderRadius: 6, padding: "2px 8px" }}>{im.estadoImovel}</span>}
                      </div>
                      <p style={{ margin: "0 0 4px", fontWeight: 500, fontSize: 16 }}>{im.titulo}</p>
                      <p style={{ margin: 0, fontSize: 13, color: "#777" }}>{[im.bairro, im.cidade].filter(Boolean).join(", ")}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {isVenda && im.preco && <p style={{ margin: 0, fontWeight: 500, fontSize: 16, color: COR.primary }}>Venda: {formatBRL(im.preco)}</p>}
                      {isLocacao && <>{parseFloat(im.valorAluguel)>0&&<p style={{ margin: 0, fontSize: 13, color: "#888" }}>Aluguel: {formatBRL(im.valorAluguel)}</p>}
                        {parseFloat(im.valorCondominio)>0&&<p style={{ margin: 0, fontSize: 13, color: "#888" }}>Cond.: {formatBRL(im.valorCondominio)}</p>}
                        {parseFloat(im.valorIPTU)>0&&<p style={{ margin: 0, fontSize: 13, color: "#888" }}>IPTU: {formatBRL(im.valorIPTU)}</p>}
                        {total>0&&<p style={{ margin: "4px 0 0", fontWeight: 500, fontSize: 15, color: COR.primary }}>Total: {formatBRL(total)}/mês</p>}</>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap", fontSize: 13, color: "#555" }}>
                    {im.metragem && <span>{im.metragem} m²</span>}
                    {im.metragemTotal && <span>{im.metragemTotal} m² terreno</span>}
                    {!isLote && parseInt(im.quartos)>0 && <span>{im.quartos} qtos</span>}
                    {!isLote && parseInt(im.suites)>0 && <span>{im.suites} suítes</span>}
                    {!isLote && parseInt(im.garagens)>0 && <span>{im.garagens} gar.</span>}
                    {isLote && im.asfalto && <span>✓ Asfalto</span>}
                    {isLote && im.agua && <span>✓ Água</span>}
                    {isLote && im.esgoto && <span>✓ Esgoto</span>}
                    {isLote && im.muro && <span>✓ Muro</span>}
                    {isLote && (im.retangular&&im.frente&&im.laterais ? <span>{im.frente}x{im.laterais}m</span> : im.medidas ? <span>{im.medidas}</span> : null)}
                    {im.mapsLink && <a href={im.mapsLink} target="_blank" rel="noreferrer" style={{ color: COR.primary, textDecoration: "none" }}>Ver mapa</a>}
                  </div>
                  <button onClick={() => openDetalhe(im)} style={{ marginTop: 10, fontSize: 12, padding: "5px 14px", borderRadius: 7, border: "1px solid #ddd", background: "#f9f9f9", cursor: "pointer" }}>Ver ficha completa</button>
                </div>
              );
            })}
          </div>}
    </div>
  );

  // ── LISTA ──
  if (view === "lista") return (
    <div style={{ fontFamily: "sans-serif", padding: "1rem", maxWidth: 900, margin: "0 auto" }}>
      <Lightbox />
      {showPassModal && <PassModal />}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: COR.primaryDark }}>Imóveis Disponíveis</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => navigate("consulta")} style={{ ...btnOutline }}>Consulta</button>
          {isAdmin && <>
            <button onClick={() => navigate("anuncios")} style={{ fontSize: 13, padding: "7px 14px", borderRadius: 8, border: "1px solid #999", background: "#f5f5f5", color: "#444", cursor: "pointer", fontWeight: 500 }}>Anúncios</button>
            <span style={{ fontSize: 12, color: COR.primary, fontWeight: 500 }}>Admin</span>
            <button onClick={() => setIsAdmin(false)} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 7, border: "1px solid #ddd", background: "#fff", cursor: "pointer" }}>Sair</button>
            <button onClick={() => { setForm(emptyForm); navigate("form"); }} style={{ ...btnPrimary }}>+ Novo</button>
          </>}
          {!isAdmin && <button onClick={() => setShowPassModal(true)} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 7, border: "1px solid #ddd", background: "#f9f9f9", cursor: "pointer", color: "#888" }}>Admin</button>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." style={{ flex: 1, minWidth: 180, padding: "9px 14px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14 }} />
        <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14 }}>
          <option value="Todos">Todos os tipos</option>{TIPOS.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={filterTransacao} onChange={e => setFilterTransacao(e.target.value)} style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14 }}>
          <option value="Todos">Todos</option>{TRANSACOES.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14 }}>
          <option value="Todos">Novo e Usado</option>{ESTADOS_IMOVEL.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={filterCidade} onChange={e => setFilterCidade(e.target.value)} style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14 }}>
          {cidades.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      {loading && <div style={{ textAlign: "center", color: "#888", padding: "4rem 0" }}>Carregando...</div>}
      {!loading && filtered.length === 0 && <div style={{ textAlign: "center", color: "#888", padding: "4rem 0" }}>{imoveis.length === 0 ? "Nenhum imóvel cadastrado ainda." : "Nenhum imóvel encontrado."}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
        {filtered.map(im => {
          const isLocacao = im.transacao === "Locação" || im.transacao === "Venda e Locação";
          const isVenda = im.transacao === "Venda" || im.transacao === "Venda e Locação";
          return (
            <div key={im.id} style={{ background: "#fff", border: "1px solid #e5e5e5", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <div onClick={() => openDetalhe(im)} style={{ height: 160, background: "#f4f4f4", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: "pointer" }}>
                {im.fotos?.[0] ? <img src={im.fotos[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 52 }}>🏠</span>}
              </div>
              <div style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
                  {im.tipo && <span style={{ fontSize: 11, background: COR.primaryLight, color: COR.primaryDark, borderRadius: 6, padding: "2px 8px" }}>{im.tipo}</span>}
                  {im.transacao && <span style={{ fontSize: 11, background: "#f5f5f5", color: "#555", borderRadius: 6, padding: "2px 8px" }}>{im.transacao}</span>}
                  {im.estadoImovel && <span style={{ fontSize: 11, background: "#f5f5f5", color: "#666", borderRadius: 6, padding: "2px 8px" }}>{im.estadoImovel}</span>}
                </div>
                {im.titulo && <p style={{ margin: "0 0 2px", fontWeight: 500, fontSize: 15 }}>{im.titulo}</p>}
                {(im.bairro||im.cidade) && <p style={{ margin: "0 0 4px", fontSize: 12, color: "#777" }}>{[im.bairro, im.cidade].filter(Boolean).join(", ")}</p>}
                {isVenda && im.preco && <p style={{ margin: "0 0 2px", fontWeight: 500, fontSize: 15, color: COR.primary }}>{formatBRL(im.preco)}</p>}
                {isLocacao && im.valorFinal && <p style={{ margin: "0 0 8px", fontWeight: 500, fontSize: 14, color: "#c0762b" }}>{formatBRL(im.valorFinal)}<span style={{ fontSize: 11, fontWeight: 400 }}>/mês</span></p>}
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => openDetalhe(im)} style={{ flex: 1, padding: "6px 0", fontSize: 12, borderRadius: 7, border: "1px solid #ddd", background: "#f9f9f9", cursor: "pointer" }}>Ver ficha</button>
                  {isAdmin && <>
                    <button onClick={() => edit(im)} style={{ padding: "6px 10px", fontSize: 12, borderRadius: 7, border: "1px solid #ddd", background: "#f9f9f9", cursor: "pointer" }}>✏️</button>
                    <button onClick={() => del(im.id)} style={{ padding: "6px 10px", fontSize: 12, borderRadius: 7, border: `1px solid ${COR.primaryBorder}`, background: COR.primaryLight, cursor: "pointer" }}>🗑️</button>
                  </>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── FORMULÁRIO ──
  if (view === "form" && isAdmin) {
    const isLote = form.tipo === "Lote" || form.tipo === "Área";
    const isLocacao = form.transacao === "Locação" || form.transacao === "Venda e Locação";
    const isVenda = form.transacao === "Venda" || form.transacao === "Venda e Locação";
    return (
      <div style={{ fontFamily: "sans-serif", padding: "1rem", maxWidth: 680, margin: "0 auto" }}>
        <div style={{ marginBottom: "1.5rem" }}><BackBtn label="Cancelar" /></div>
        <h2 style={{ margin: "0 0 1.5rem", fontSize: 20, fontWeight: 500, color: COR.primaryDark }}>{form.id ? "Editar imóvel" : "Novo imóvel"}</h2>
        {section("Informações gerais", <>
          {inp("Título *", "titulo", { ph: "Ex: Casa 3 quartos Setor Sul" })}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {sel("Tipo de imóvel", "tipo", TIPOS)}
            {sel("Tipo de transação", "transacao", TRANSACOES)}
            {sel("Estado do imóvel", "estadoImovel", ESTADOS_IMOVEL)}
          </div>
          {inp("Metragem de construção (m²)", "metragem", { type: "number" })}
          {inp("Metragem total do terreno (m²)", "metragemTotal", { type: "number" })}
          {tog("Em condomínio?", "condominio")}
          {form.condominio && <>{inp("Nome do condomínio", "nomeCondominio")}</>}
        </>)}
        {section("Condições comerciais", <>
          {CONDICOES.map(c => (
            <div key={c}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer", marginBottom: 8 }}>
                <input type="checkbox" checked={form.condicoes?.includes(c)||false} onChange={() => toggleCondicao(c)} style={{ width: 16, height: 16, accentColor: COR.primary }} />{c}
              </label>
              {c === "Permuta" && form.condicoes?.includes("Permuta") && (
                <input value={form.permuta||""} onChange={e => sf("permuta", e.target.value)} placeholder="Descreva o que aceita em permuta..."
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, boxSizing: "border-box", marginBottom: 8 }} />
              )}
            </div>
          ))}
        </>)}
        {section("Fotos", <>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={addFotos} style={{ display: "none" }} />
          <button onClick={() => fileRef.current.click()} disabled={uploadingFotos}
            style={{ padding: "9px 18px", borderRadius: 8, border: "1px dashed #bbb", background: uploadingFotos?"#f0f0f0":"#fafafa", cursor: uploadingFotos?"default":"pointer", fontSize: 13 }}>
            {uploadingFotos ? "Enviando fotos..." : "+ Adicionar fotos"}
          </button>
          {form.fotos?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {form.fotos.map((f, i) => (
                <div key={i} style={{ position: "relative" }}>
                  <img src={f} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid #ddd" }} />
                  <button onClick={() => removeFoto(i)} style={{ position: "absolute", top: -7, right: -7, background: COR.primary, color: "#fff", border: "none", borderRadius: "50%", width: 22, height: 22, fontSize: 13, cursor: "pointer", lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </>)}
        {section("Localização", <>
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 4 }}>CEP</label>
            <input value={form.cep||""} onChange={e => { sf("cep", e.target.value); buscarCEP(e.target.value); }} placeholder="Ex: 74000000" maxLength={8}
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box" }} />
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#888" }}>Digite o CEP (somente números) para preencher automaticamente.</p>
          </div>
          {inp("Cidade", "cidade", { ph: "Ex: Goiânia" })}
          {inp("Bairro", "bairro", { ph: "Ex: Setor Sul" })}
          {inp("Endereço (visível só para admin)", "endereco", { ph: "Ex: Rua das Flores, 123" })}
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 5 }}>Link do Google Maps</label>
            <input value={form.mapsLink||""} onChange={e => sf("mapsLink", e.target.value)} placeholder="Cole aqui o link do Google Maps"
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box" }} />
            {form.mapsLink && <a href={form.mapsLink} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: COR.primary, textDecoration: "none" }}>Verificar link →</a>}
          </div>
          {isLote && <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>{tog("Asfalto", "asfalto")}{tog("Água", "agua")}{tog("Esgoto", "esgoto")}</div>}
        </>)}
        {isLote && section("Detalhes do " + form.tipo, <>
          {sel("Declive", "declive", ["Plano", "Lateral", "Fundo", "Frente"])}
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 8 }}>{tog("Muro", "muro")}{tog("Esquina", "esquina")}{tog("Retangular", "retangular")}</div>
          {form.retangular ? <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>{inp("Frente (m)", "frente", { type: "number" })}{inp("Laterais (m)", "laterais", { type: "number" })}</div>
            : inp("Medidas", "medidas", { ph: "Ex: 15x30 irregular" })}
        </>)}
        {(form.tipo === "Casa" || form.tipo === "Apartamento") && section("Detalhes da " + form.tipo, <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {inp("Quartos", "quartos", { type: "number" })}{inp("Suítes", "suites", { type: "number" })}{inp("Garagens", "garagens", { type: "number" })}
            {inp("Valor de avaliação (R$)", "valorAvaliacao", { type: "number" })}{inp("Valor de entrada (R$)", "valorEntrada", { type: "number" })}
            {form.tipo === "Apartamento" && inp("Valor do condomínio (R$)", "valorCondominio", { type: "number" })}
          </div>
        </>)}
        {isVenda && section("Valor de venda", <>{inp("Preço de venda (R$)", "preco", { type: "number", ph: "Ex: 350000" })}</>)}
        {isLocacao && section("Valores de locação", <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {inp("Aluguel (R$)", "valorAluguel", { type: "number" })}{inp("Condomínio (R$)", "valorCondominio", { type: "number" })}{inp("IPTU (R$)", "valorIPTU", { type: "number" })}
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: COR.primary, fontWeight: 500 }}>Total: {formatBRL(valorFinalLocacao())||"—"}</p>
        </>)}
        {section("Descrição", <>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 4 }}>Características extras (uma por linha)</label>
            <textarea value={form.extras||""} onChange={e => sf("extras", e.target.value)} placeholder={"Ex:\nAr condicionado\nPiscina aquecida"} rows={3}
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box", resize: "vertical", lineHeight: 1.6 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <label style={{ fontSize: 13, color: "#555" }}>Descrição completa (editável)</label>
            <button onClick={() => sf("descricao", gerarDescricao(form))} style={{ fontSize: 12, padding: "4px 12px", borderRadius: 7, border: `1px solid ${COR.primary}`, background: COR.primaryLight, color: COR.primary, cursor: "pointer" }}>Gerar automaticamente</button>
          </div>
          <textarea value={form.descricao||""} onChange={e => sf("descricao", e.target.value)} placeholder="Clique em 'Gerar automaticamente' ou escreva manualmente..." rows={10}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box", resize: "vertical", lineHeight: 1.6 }} />
        </>)}
        {section("Proprietário (visível só para admin)", <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>{inp("Nome", "nomeProprietario")}{inpTel("Telefone", "telefoneProprietario")}</div>
        </>)}
        {section("Captador", <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>{inp("Nome", "nomeCaptador")}{inpTel("Telefone", "telefoneCaptador")}</div>
        </>)}
        {section("Onde foi anunciado (visível só para admin)", <>
          {CANAIS.map(canal => { const info = form.anuncios?.[canal]; return (
            <div key={canal} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1 }}>
                <input type="checkbox" checked={!!info?.ativo} onChange={() => toggleAnuncio(canal)} style={{ width: 16, height: 16, accentColor: COR.primary }} />
                <span style={{ fontSize: 14 }}>{canal}</span>
              </label>
              {info?.ativo && <span style={{ fontSize: 12, color: "#888" }}>{info.data}</span>}
            </div>
          ); })}
        </>)}
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button onClick={goBack} style={{ flex: 1, padding: "11px 0", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 14 }}>Cancelar</button>
          <button onClick={save} disabled={saving||uploadingFotos}
            style={{ flex: 2, padding: "11px 0", borderRadius: 8, border: "none", background: (saving||uploadingFotos)?"#aaa":COR.primary, color: "#fff", cursor: (saving||uploadingFotos)?"default":"pointer", fontSize: 14, fontWeight: 500 }}>
            {saving ? "Salvando..." : uploadingFotos ? "Aguarde o upload..." : "Salvar imóvel"}
          </button>
        </div>
      </div>
    );
  }

  // ── DETALHE ──
  if (view === "detalhe") {
    const im = imoveis.find(i => i.id === selected?.id) || selected;
    const isLote = im?.tipo === "Lote" || im?.tipo === "Área";
    const isLocacao = im?.transacao === "Locação" || im?.transacao === "Venda e Locação";
    const isVenda = im?.transacao === "Venda" || im?.transacao === "Venda e Locação";
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
          <BackBtn />
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, flex: 1 }}>{im?.titulo||"Ficha do imóvel"}</h2>
          {isAdmin && <button onClick={() => edit(im)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 13 }}>Editar</button>}
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: "1rem", flexWrap: "wrap" }}>
          {im?.tipo && <span style={{ fontSize: 12, background: COR.primaryLight, color: COR.primaryDark, borderRadius: 6, padding: "3px 10px" }}>{im.tipo}</span>}
          {im?.transacao && <span style={{ fontSize: 12, background: "#f5f5f5", color: "#555", borderRadius: 6, padding: "3px 10px" }}>{im.transacao}</span>}
          {im?.estadoImovel && <span style={{ fontSize: 12, background: "#f5f5f5", color: "#555", borderRadius: 6, padding: "3px 10px" }}>{im.estadoImovel}</span>}
          {im?.condominio && <span style={{ fontSize: 12, background: "#f0f0f0", color: "#555", borderRadius: 6, padding: "3px 10px" }}>Condomínio{im.nomeCondominio?`: ${im.nomeCondominio}`:""}</span>}
          {im?.condicoes?.map(c => <span key={c} style={{ fontSize: 12, background: COR.primaryLight, color: COR.primaryDark, borderRadius: 6, padding: "3px 10px" }}>{c}</span>)}
        </div>

        {/* FOTOS — antes do Maps */}
        {im?.fotos?.length > 0 ? (
          <div style={{ marginBottom: "1.2rem" }}>
            <img src={im.fotos[fotoIdx]} alt="" onClick={() => openLightbox(im.fotos, fotoIdx)}
              style={{ width: "100%", maxHeight: 400, objectFit: "contain", borderRadius: 12, border: "1px solid #eee", cursor: "zoom-in", background: "#f4f4f4" }} />
            {im.fotos.length > 1 && (
              <div style={{ display: "flex", gap: 8, marginTop: 8, overflowX: "auto" }}>
                {im.fotos.map((f, i) => <img key={i} src={f} onClick={() => setFotoIdx(i)} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, cursor: "pointer", flexShrink: 0, border: i===fotoIdx?`2px solid ${COR.primary}`:"1px solid #ddd" }} />)}
              </div>
            )}
          </div>
        ) : <div style={{ height: 180, background: "#f4f4f4", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60, marginBottom: "1.2rem" }}>🏠</div>}

        {isVenda && im?.preco && <p style={{ fontSize: 24, fontWeight: 500, color: COR.primary, margin: "0 0 8px" }}>Venda: {formatBRL(im.preco)}</p>}
        {isLocacao && <div style={{ marginBottom: "1rem" }}>
          {row("Aluguel", formatBRL(im?.valorAluguel))}{row("Condomínio", formatBRL(im?.valorCondominio))}{row("IPTU", formatBRL(im?.valorIPTU))}
          {im?.valorFinal && <p style={{ fontSize: 20, fontWeight: 500, color: COR.primary, margin: "8px 0" }}>Total locação: {formatBRL(im.valorFinal)}/mês</p>}
        </div>}
        {(im?.cidade||im?.bairro) && section("Localização", <>
          {row("Cidade", im.cidade)}{row("Bairro", im.bairro)}
          {isAdmin && row("Endereço", im.endereco)}
          {isLote && <>{row("Asfalto", im.asfalto?"Sim":null)}{row("Água", im.agua?"Sim":null)}{row("Esgoto", im.esgoto?"Sim":null)}</>}
          {im.mapsLink && <a href={im.mapsLink} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8, padding: "8px 18px", background: COR.primary, color: "#fff", borderRadius: 8, fontSize: 14, textDecoration: "none", fontWeight: 500 }}>Ver no Google Maps</a>}
        </>)}
        {section("Características", <>
          {row("Estado", im?.estadoImovel)}
          {row("Metragem", im?.metragem ? im.metragem+" m²" : null)}
          {row("Metragem total", im?.metragemTotal ? im.metragemTotal+" m²" : null)}
          {im?.condominio && row("Condomínio mensal", formatBRL(im.valorCondominioMensal))}
          {isLote && <>{row("Declive", im?.declive)}{row("Muro", im?.muro?"Sim":"Não")}{row("Esquina", im?.esquina?"Sim":"Não")}{row("Retangular", im?.retangular?"Sim":"Não")}{im?.retangular?<>{row("Frente", im.frente?im.frente+" m":null)}{row("Laterais", im.laterais?im.laterais+" m":null)}</>:row("Medidas", im?.medidas)}</>}
          {(im?.tipo==="Casa"||im?.tipo==="Apartamento")&&<>{row("Quartos", im.quartos)}{row("Suítes", im.suites)}{row("Garagens", im.garagens)}{row("Valor de avaliação", formatBRL(im.valorAvaliacao))}{row("Valor de entrada", formatBRL(im.valorEntrada))}{im.tipo==="Apartamento"&&row("Condomínio", formatBRL(im.valorCondominio))}</>}
        </>)}
        {im?.condicoes?.length > 0 && section("Condições comerciais", <>
          {im.condicoes.map(c => <div key={c} style={{ fontSize: 14, marginBottom: 4 }}>{c}{c==="Permuta"&&im.permuta?`: ${im.permuta}`:""}</div>)}
        </>)}
        {im?.descricao && section("Descrição", <>
          <p style={{ fontSize: 14, color: "#444", lineHeight: 1.75, margin: "0 0 12px", whiteSpace: "pre-wrap" }}>{im.descricao}</p>
          {!im.descricao.includes(RODAPE) && <p style={{ fontSize: 12, color: "#888", fontStyle: "italic", margin: 0 }}>{RODAPE}</p>}
        </>)}
        {(im?.nomeCaptador||im?.telefoneCaptador) && section("Captador", <>{row("Nome", im.nomeCaptador)}{row("Telefone", im.telefoneCaptador)}</>)}
        {isAdmin&&(im?.nomeProprietario||im?.telefoneProprietario)&&section("Proprietário", <>{row("Nome", im.nomeProprietario)}{row("Telefone", im.telefoneProprietario)}</>)}
        {isAdmin&&Object.values(im?.anuncios||{}).some(a=>a?.ativo)&&section("Anúncios", <>
          {CANAIS.filter(c=>im.anuncios?.[c]?.ativo).map(c=><div key={c} style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}><span>{c}</span><span style={{ color:"#888" }}>{im.anuncios[c].data}</span></div>)}
        </>)}
        <p style={{ fontSize: 13, fontWeight: 500, color: "#555", margin: "1.5rem 0 8px" }}>Compartilhar via WhatsApp</p>
        <button onClick={() => whatsappTudo(im)}
          style={{ width: "100%", padding: "13px 0", borderRadius: 8, border: "none", background: COR.primary, color: "#fff", cursor: "pointer", fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
          Compartilhar tudo
        </button>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <button onClick={() => whatsappDescricao(im)} style={{ flex: 1, minWidth: 110, padding: "10px 0", borderRadius: 8, border: "none", background: "#25D366", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>Descrição</button>
          <button onClick={() => whatsappMaps(im)} style={{ flex: 1, minWidth: 110, padding: "10px 0", borderRadius: 8, border: "none", background: "#128C7E", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>Localização</button>
          <button onClick={() => whatsappFotos(im)} style={{ flex: 1, minWidth: 110, padding: "10px 0", borderRadius: 8, border: "none", background: "#075E54", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>Fotos</button>
        </div>
        <button onClick={() => downloadFotos(im)} style={{ width: "100%", padding: "11px 0", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 14 }}>Baixar todas as fotos</button>
      </div>
    );
  }

  return null;
}
