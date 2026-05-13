import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, orderBy, query } from "firebase/firestore";

const ADMIN_PASS = "123livre";

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

const emptyForm = { id: null, titulo: "", preco: "", descricao: "", mapsLink: "", fotos: [] };

export default function App() {
  const [imoveis, setImoveis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState("lista");
  const [form, setForm] = useState(emptyForm);
  const [fotoIdx, setFotoIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPassModal, setShowPassModal] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [passError, setPassError] = useState(false);
  const [search, setSearch] = useState("");
  const fileRef = useRef();

  useEffect(() => {
    const q = query(collection(db, "imoveis"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, snap => {
      setImoveis(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const handleLogin = () => {
    if (passInput === ADMIN_PASS) {
      setIsAdmin(true); setShowPassModal(false); setPassInput(""); setPassError(false);
    } else {
      setPassError(true);
    }
  };

  const save = async () => {
    if (!form.titulo && !form.preco && !form.descricao) return alert("Preencha ao menos um campo.");
    setSaving(true);
    try {
      const { id, ...data } = form;
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

  const edit = (im) => { setForm({ ...im }); setView("form"); };
  const openDetalhe = (im) => { setSelected(im); setFotoIdx(0); setView("detalhe"); };

  const compressImage = (file) => new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 800;
      let { width: w, height: h } = img;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.src = url;
  });

  const addFotos = (e) => {
    Array.from(e.target.files).forEach(async f => {
      const compressed = await compressImage(f);
      setForm(p => ({ ...p, fotos: [...(p.fotos || []), compressed] }));
    });
  };

  const removeFoto = (i) => setForm(p => ({ ...p, fotos: p.fotos.filter((_, idx) => idx !== i) }));

  const whatsappDescricao = (im) => {
    const txt = `🏠 *${im.titulo || "Imóvel disponível"}*\n\n` +
      (im.preco ? `💰 ${formatBRL(im.preco)}\n\n` : "") +
      (im.descricao ? `${im.descricao}` : "");
    window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
  };

  const whatsappMaps = (im) => {
    if (!im.mapsLink) return alert("Este imóvel não tem link do Google Maps.");
    const txt = `📍 *Localização do imóvel:*\n${im.mapsLink}`;
    window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
  };

  const downloadFotos = (im) => {
    if (!im.fotos?.length) return alert("Este imóvel não tem fotos.");
    im.fotos.forEach((foto, i) => {
      const a = document.createElement("a");
      a.href = foto;
      a.download = `${im.titulo || "imovel"}_foto${i + 1}.jpg`;
      a.click();
    });
  };

  const filtered = imoveis.filter(im => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (im.titulo || "").toLowerCase().includes(q) ||
      (im.descricao || "").toLowerCase().includes(q) ||
      (im.preco || "").toString().includes(q);
  });

  const s = { fontFamily: "sans-serif", padding: "1rem", maxWidth: 820, margin: "0 auto" };

  // ── MODAL SENHA ──
  const PassModal = () => (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: "2rem", width: 300, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
        <h3 style={{ margin: "0 0 1rem", fontSize: 18 }}>🔐 Acesso Admin</h3>
        <input type="password" value={passInput} onChange={e => { setPassInput(e.target.value); setPassError(false); }}
          onKeyDown={e => e.key === "Enter" && handleLogin()}
          placeholder="Digite a senha" autoFocus
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
    <div style={s}>
      {showPassModal && <PassModal />}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>🏠 Imóveis Disponíveis</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isAdmin
            ? <>
                <span style={{ fontSize: 12, color: "#1D9E75", fontWeight: 500 }}>✅ Admin</span>
                <button onClick={() => setIsAdmin(false)} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 7, border: "1px solid #ddd", background: "#fff", cursor: "pointer" }}>Sair</button>
                <button onClick={() => { setForm(emptyForm); setView("form"); }}
                  style={{ background: "#1D9E75", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 500, fontSize: 14 }}>+ Novo</button>
              </>
            : <button onClick={() => setShowPassModal(true)}
                style={{ fontSize: 12, padding: "5px 10px", borderRadius: 7, border: "1px solid #ddd", background: "#f9f9f9", cursor: "pointer", color: "#888" }}>Admin</button>
          }
        </div>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar por palavra-chave..."
        style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box", marginBottom: "1rem" }} />

      {loading && <div style={{ textAlign: "center", color: "#888", padding: "4rem 0" }}>Carregando...</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", color: "#888", padding: "4rem 0", fontSize: 15 }}>
          {imoveis.length === 0 ? "Nenhum imóvel cadastrado ainda." : "Nenhum imóvel encontrado para essa busca."}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 16 }}>
        {filtered.map(im => (
          <div key={im.id} style={{ background: "#fff", border: "1px solid #e5e5e5", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div onClick={() => openDetalhe(im)} style={{ height: 160, background: "#f4f4f4", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: "pointer" }}>
              {im.fotos?.[0] ? <img src={im.fotos[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 52 }}>🏠</span>}
            </div>
            <div style={{ padding: "12px 14px" }}>
              {im.titulo && <p style={{ margin: "0 0 4px", fontWeight: 500, fontSize: 15 }}>{im.titulo}</p>}
              {im.preco && <p style={{ margin: "0 0 6px", fontWeight: 500, fontSize: 17, color: "#1D9E75" }}>{formatBRL(im.preco)}</p>}
              {im.descricao && <p style={{ margin: "0 0 10px", fontSize: 13, color: "#555", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{im.descricao}</p>}
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

  // ── FORMULÁRIO (só admin) ──
  if (view === "form" && isAdmin) return (
    <div style={{ fontFamily: "sans-serif", padding: "1rem", maxWidth: 620, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.5rem" }}>
        <button onClick={() => setView("lista")} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer" }}>←</button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>{form.id ? "Editar imóvel" : "Novo imóvel"}</h2>
      </div>

      {[{ label: "🏷️ Título", key: "titulo", ph: "Ex: Apartamento 3 quartos Moema", type: "text" }, { label: "💰 Preço", key: "preco", ph: "Ex: 850000", type: "number" }].map(({ label, key, ph, type }) => (
        <div key={key} style={{ marginBottom: "1.2rem" }}>
          <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 5 }}>{label}</label>
          <input type={type} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} placeholder={ph}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 15, boxSizing: "border-box" }} />
        </div>
      ))}

      <div style={{ marginBottom: "1.2rem" }}>
        <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 5 }}>📝 Descrição</label>
        <textarea value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
          placeholder="Descreva o imóvel..." rows={5}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box", resize: "vertical", lineHeight: 1.6 }} />
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 5 }}>📍 Link do Google Maps</label>
        <input value={form.mapsLink} onChange={e => setForm(p => ({ ...p, mapsLink: e.target.value }))}
          placeholder="Cole aqui o link do Google Maps"
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box" }} />
        {form.mapsLink && <a href={form.mapsLink} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 6, fontSize: 13, color: "#1D9E75", textDecoration: "none" }}>🔗 Verificar link →</a>}
        <p style={{ margin: "6px 0 0", fontSize: 11, color: "#888" }}>Dica: no Google Maps, clique no local → "Compartilhar" → copie o link.</p>
      </div>

      <div style={{ marginBottom: "1.8rem" }}>
        <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 8 }}>📷 Fotos</label>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={addFotos} style={{ display: "none" }} />
        <button onClick={() => fileRef.current.click()} style={{ padding: "9px 18px", borderRadius: 8, border: "1px dashed #bbb", background: "#fafafa", cursor: "pointer", fontSize: 13 }}>+ Adicionar fotos</button>
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
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => setView("lista")} style={{ flex: 1, padding: "11px 0", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 14 }}>Cancelar</button>
        <button onClick={save} disabled={saving} style={{ flex: 2, padding: "11px 0", borderRadius: 8, border: "none", background: saving ? "#aaa" : "#1D9E75", color: "#fff", cursor: saving ? "default" : "pointer", fontSize: 14, fontWeight: 500 }}>
          {saving ? "Salvando..." : "Salvar imóvel"}
        </button>
      </div>
    </div>
  );

  // ── DETALHE ──
  if (view === "detalhe") {
    const im = imoveis.find(i => i.id === selected?.id) || selected;
    return (
      <div style={{ fontFamily: "sans-serif", padding: "1rem", maxWidth: 620, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1rem" }}>
          <button onClick={() => setView("lista")} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer" }}>←</button>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, flex: 1 }}>{im.titulo || "Ficha do imóvel"}</h2>
          {isAdmin && <button onClick={() => edit(im)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 13 }}>✏️ Editar</button>}
        </div>

        {im.fotos?.length > 0 ? (
          <div style={{ marginBottom: "1.2rem" }}>
            <img src={im.fotos[fotoIdx]} alt="" style={{ width: "100%", height: 280, objectFit: "cover", borderRadius: 12, border: "1px solid #eee" }} />
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

        {im.preco && <p style={{ fontSize: 24, fontWeight: 500, color: "#1D9E75", margin: "0 0 1rem" }}>{formatBRL(im.preco)}</p>}

        {im.descricao && (
          <div style={{ marginBottom: "1.2rem" }}>
            <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 6px", color: "#333" }}>Descrição</p>
            <p style={{ fontSize: 14, color: "#444", lineHeight: 1.75, margin: 0, whiteSpace: "pre-wrap" }}>{im.descricao}</p>
          </div>
        )}

        {im.mapsLink && (
          <div style={{ background: "#f0faf5", border: "1px solid #9FE1CB", borderRadius: 10, padding: "12px 16px", marginBottom: "1.5rem" }}>
            <a href={im.mapsLink} target="_blank" rel="noreferrer"
              style={{ display: "inline-block", padding: "8px 18px", background: "#1D9E75", color: "#fff", borderRadius: 8, fontSize: 14, textDecoration: "none", fontWeight: 500 }}>
              🗺️ Ver no Google Maps
            </a>
          </div>
        )}

        <p style={{ fontSize: 13, fontWeight: 500, color: "#555", margin: "0 0 8px" }}>📲 Compartilhar via WhatsApp</p>
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
