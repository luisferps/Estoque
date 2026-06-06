import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteDoc, doc, addDoc, collection } from "firebase/firestore";
import { db } from "../firebase";
import { useImoveis, useTipos } from "../shared/hooks";
import { matchTransacao, ordenarImoveis, statusDoImovel } from "../shared/utils";
import { btnPrimary, btnOutline, pageWrap } from "../shared/styles";
import { DarkModeToggle } from "../shared/ThemeProvider";
import ImovelCard from "../shared/ImovelCard";
import Filtros from "../shared/Filtros";

export default function Lista({ onLogout }) {
  const navigate = useNavigate();
  const { imoveis, loading } = useImoveis();
  const { tipos } = useTipos();
  const [search, setSearch] = useState("");
  const [tipo, setTipo] = useState("Todos");
  const [transacao, setTransacao] = useState("Todos");
  const [estado, setEstado] = useState("Todos");
  const [cidade, setCidade] = useState("Todas");
  const [status, setStatus] = useState("Todos");
  const [ordem, setOrdem] = useState("recente");

  const cidades = useMemo(() => ["Todas", ...Array.from(new Set(imoveis.map(im => im.cidade).filter(Boolean))).sort()], [imoveis]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const base = imoveis.filter(im =>
      (!q || (im.titulo || "").toLowerCase().includes(q) || (im.descricao || "").toLowerCase().includes(q) || (im.cidade || "").toLowerCase().includes(q) || (im.bairro || "").toLowerCase().includes(q))
      && (tipo === "Todos" || im.tipo === tipo)
      && matchTransacao(im, transacao)
      && (estado === "Todos" || im.estadoImovel === estado)
      && (cidade === "Todas" || im.cidade === cidade)
      && (status === "Todos" || statusDoImovel(im) === status)
    );
    return ordenarImoveis(base, ordem);
  }, [imoveis, search, tipo, transacao, estado, cidade, status, ordem]);

  const del = async (id) => {
    if (!window.confirm("Excluir?")) return;
    await deleteDoc(doc(db, "imoveis", id));
  };

  const duplicar = async (im) => {
    if (!window.confirm(`Duplicar "${im.titulo}"?`)) return;
    const { id: _id, createdAt: _ca, ...data } = im;
    await addDoc(collection(db, "imoveis"), {
      ...data,
      titulo: `${data.titulo} (cópia)`,
      anuncios: {},
      createdAt: Date.now()
    });
  };

  return (
    <div style={pageWrap(1100)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: "var(--primary-dark)" }}>
          Painel Admin — Imóveis ({filtered.length})
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <DarkModeToggle />
          <button onClick={() => navigate("/")} style={btnOutline}>Ver site público</button>
          <button onClick={() => navigate("/admin/consulta")} style={btnOutline}>Consulta</button>
          <button onClick={() => navigate("/admin/anuncios")} style={menuBtn}>Anúncios</button>
          <button onClick={() => navigate("/admin/rotacao")} style={menuBtnDestaque}>🏠 Rotação</button>
          <button onClick={() => navigate("/admin/corretores")} style={menuBtn}>Corretores</button>
          <button onClick={() => navigate("/admin/importar")} style={menuBtn}>Importar</button>
          <button onClick={() => navigate("/admin/tipos")} style={menuBtn}>Tipos</button>
          <span style={{ fontSize: 12, color: "var(--primary)", fontWeight: 500 }}>Admin</span>
          <button onClick={onLogout} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer" }}>Sair</button>
          <button onClick={() => navigate("/admin/novo")} style={btnPrimary}>+ Novo</button>
        </div>
      </div>

      <Filtros
        search={search} setSearch={setSearch}
        tipo={tipo} setTipo={setTipo}
        transacao={transacao} setTransacao={setTransacao}
        estado={estado} setEstado={setEstado}
        cidade={cidade} setCidade={setCidade}
        status={status} setStatus={setStatus}
        ordem={ordem} setOrdem={setOrdem}
        cidades={cidades}
        tipos={tipos}
        showStatus={true}
      />

      {loading && <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "4rem 0" }}>Carregando...</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "4rem 0" }}>
          {imoveis.length === 0 ? "Nenhum imóvel cadastrado ainda." : "Nenhum imóvel encontrado."}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
        {filtered.map(im => (
          <ImovelCard
            key={im.id}
            im={im}
            onClick={() => navigate(`/admin/imovel/${im.id}`)}
            actions={
              <>
                <button onClick={() => navigate(`/admin/imovel/${im.id}`)} style={miniBtn}>Ficha</button>
                <button onClick={() => navigate(`/admin/editar/${im.id}`)} style={miniBtn} title="Editar">✏️</button>
                <button onClick={() => duplicar(im)} style={miniBtn} title="Duplicar">📋</button>
                <button onClick={() => del(im.id)} style={{ ...miniBtn, border: "1px solid var(--primary-border)", background: "var(--primary-light)" }} title="Excluir">🗑️</button>
              </>
            }
          />
        ))}
      </div>
    </div>
  );
}

const miniBtn = {
  flex: 1, padding: "6px 8px", fontSize: 12, borderRadius: 7,
  border: "1px solid var(--border-soft)", background: "var(--bg-muted)",
  color: "var(--text)", cursor: "pointer"
};

const menuBtn = {
  fontSize: 13, padding: "7px 14px", borderRadius: 8,
  border: "1px solid var(--border-soft)", background: "var(--bg-muted)",
  color: "var(--text-soft)", cursor: "pointer", fontWeight: 500
};

const menuBtnDestaque = {
  fontSize: 13, padding: "7px 14px", borderRadius: 8,
  border: "1px solid var(--primary)", background: "var(--primary-light)",
  color: "var(--primary-dark)", cursor: "pointer", fontWeight: 600
};
