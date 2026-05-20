import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useImoveis } from "../shared/hooks";
import { matchTransacao, ordenarImoveis, statusDoImovel, waContatoImovel } from "../shared/utils";
import { pageWrap } from "../shared/styles";
import { EMPRESA } from "../constants";
import Header from "./Header";
import ImovelCard from "../shared/ImovelCard";
import Filtros from "../shared/Filtros";

export default function Home() {
  const navigate = useNavigate();
  const { imoveis, loading } = useImoveis();
  const [search, setSearch] = useState("");
  const [tipo, setTipo] = useState("Todos");
  const [transacao, setTransacao] = useState("Todos");
  const [estado, setEstado] = useState("Todos");
  const [cidade, setCidade] = useState("Todas");
  const [ordem, setOrdem] = useState("recente");

  // Site público mostra apenas imóveis "Disponíveis"
  const publicos = useMemo(() => imoveis.filter(im => statusDoImovel(im) === "Disponível"), [imoveis]);
  const cidades = useMemo(() => ["Todas", ...Array.from(new Set(publicos.map(im => im.cidade).filter(Boolean))).sort()], [publicos]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const base = publicos.filter(im =>
      (!q || (im.titulo || "").toLowerCase().includes(q) || (im.descricao || "").toLowerCase().includes(q) || (im.cidade || "").toLowerCase().includes(q) || (im.bairro || "").toLowerCase().includes(q))
      && (tipo === "Todos" || im.tipo === tipo)
      && matchTransacao(im, transacao)
      && (estado === "Todos" || im.estadoImovel === estado)
      && (cidade === "Todas" || im.cidade === cidade)
    );
    return ordenarImoveis(base, ordem);
  }, [publicos, search, tipo, transacao, estado, cidade, ordem]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      <Header />

      {/* Hero */}
      <div style={{
        background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)",
        color: "#fff", padding: "3rem 1.5rem 2rem", textAlign: "center"
      }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 600, letterSpacing: -0.5 }}>
          Encontre o imóvel ideal
        </h1>
        <p style={{ margin: 0, fontSize: 14, opacity: 0.9 }}>
          {publicos.length} imóv{publicos.length === 1 ? "el disponível" : "eis disponíveis"} para venda e locação
        </p>
      </div>

      <div style={pageWrap(1100)}>
        <Filtros
          search={search} setSearch={setSearch}
          tipo={tipo} setTipo={setTipo}
          transacao={transacao} setTransacao={setTransacao}
          estado={estado} setEstado={setEstado}
          cidade={cidade} setCidade={setCidade}
          ordem={ordem} setOrdem={setOrdem}
          cidades={cidades}
        />

        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 1rem" }}>
          {filtered.length} {filtered.length === 1 ? "imóvel encontrado" : "imóveis encontrados"}
        </p>

        {loading && <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "4rem 0" }}>Carregando...</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "4rem 0" }}>Nenhum imóvel encontrado com esses filtros.</div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {filtered.map(im => (
            <ImovelCard
              key={im.id}
              im={im}
              onClick={() => navigate(`/imovel/${im.id}`)}
              showStatus={false}
              actions={
                <>
                  <a
                    href={waContatoImovel(im, EMPRESA.whatsapp)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{
                      flex: 1, padding: "8px 0", fontSize: 13, borderRadius: 7,
                      border: "none", background: "#25D366", color: "#fff",
                      cursor: "pointer", fontWeight: 600, textAlign: "center",
                      textDecoration: "none", display: "flex",
                      alignItems: "center", justifyContent: "center", gap: 4
                    }}>
                    💬 WhatsApp
                  </a>
                  <button onClick={() => navigate(`/imovel/${im.id}`)} style={{
                    flex: 1, padding: "8px 0", fontSize: 13, borderRadius: 7,
                    border: "1px solid var(--primary)", background: "var(--bg-card)",
                    color: "var(--primary)", cursor: "pointer", fontWeight: 500
                  }}>
                    Ver detalhes
                  </button>
                </>
              }
            />
          ))}
        </div>

        <footer style={{ textAlign: "center", padding: "3rem 1rem 1rem", color: "var(--text-muted)", fontSize: 12 }}>
          <p style={{ margin: "0 0 4px" }}>© {new Date().getFullYear()} {EMPRESA.nome}</p>
          <p style={{ margin: 0 }}>{EMPRESA.email}{EMPRESA.instagram ? ` • ${EMPRESA.instagram}` : ""}</p>
        </footer>
      </div>
    </div>
  );
}
