import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useImoveis, useAuthUser, useCorretores } from "../shared/hooks";
import { matchTransacao, ordenarImoveis, statusDoImovel } from "../shared/utils";
import { pageWrap } from "../shared/styles";
import { LOGO_URL, EMPRESA } from "../constants";
import { DarkModeToggle } from "../shared/ThemeProvider";
import ImovelCard from "../shared/ImovelCard";
import Filtros from "../shared/Filtros";

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, loading: loadingAuth } = useAuthUser();
  const { imoveis, loading: loadingIm } = useImoveis();
  const { corretores } = useCorretores();
  const [search, setSearch] = useState("");
  const [tipo, setTipo] = useState("Todos");
  const [transacao, setTransacao] = useState("Todos");
  const [estado, setEstado] = useState("Todos");
  const [cidade, setCidade] = useState("Todas");
  const [ordem, setOrdem] = useState("recente");

  // Encontra os dados do corretor logado
  const meuPerfil = corretores.find(c => c.email === user?.email);
  const ativo = !meuPerfil || meuPerfil.ativo !== false; // padrão: ativo se não houver registro (legado)

  // Disponíveis pra venda/locação (corretor não vê reservados/vendidos)
  const disponiveis = useMemo(() => imoveis.filter(im => statusDoImovel(im) === "Disponível"), [imoveis]);
  const cidades = useMemo(() => ["Todas", ...Array.from(new Set(disponiveis.map(im => im.cidade).filter(Boolean))).sort()], [disponiveis]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const base = disponiveis.filter(im =>
      (!q || (im.titulo || "").toLowerCase().includes(q) || (im.descricao || "").toLowerCase().includes(q) || (im.cidade || "").toLowerCase().includes(q) || (im.bairro || "").toLowerCase().includes(q))
      && (tipo === "Todos" || im.tipo === tipo)
      && matchTransacao(im, transacao)
      && (estado === "Todos" || im.estadoImovel === estado)
      && (cidade === "Todas" || im.cidade === cidade)
    );
    return ordenarImoveis(base, ordem);
  }, [disponiveis, search, tipo, transacao, estado, cidade, ordem]);

  const logout = async () => { await signOut(auth); navigate("/corretores"); };

  if (loadingAuth || loadingIm) return <div style={pageWrap()}>Carregando...</div>;

  if (!user) {
    navigate("/corretores");
    return null;
  }

  if (!ativo) {
    return (
      <div style={{ ...pageWrap(), textAlign: "center", padding: "4rem 1rem" }}>
        <h2 style={{ color: "var(--text)" }}>Acesso desativado</h2>
        <p style={{ color: "var(--text-muted)" }}>Seu acesso de corretor está desativado. Entre em contato com a administração.</p>
        <button onClick={logout} style={{ marginTop: 16, padding: "10px 24px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer" }}>
          Sair
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      <header style={{
        background: "var(--bg-card)", borderBottom: "1px solid var(--border)",
        padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 10
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {LOGO_URL && <img src={LOGO_URL} alt="Logo" style={{ height: 104, objectFit: "contain" }} />}
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: "var(--text)" }}>Área do Corretor</p>
            <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>{meuPerfil?.nome || user.email}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <DarkModeToggle />
          <button onClick={logout} style={{
            padding: "7px 14px", fontSize: 13, borderRadius: 8,
            border: "1px solid var(--border-soft)", background: "var(--bg-muted)",
            color: "var(--text-soft)", cursor: "pointer"
          }}>Sair</button>
        </div>
      </header>

      <div style={pageWrap(1100)}>
        <h2 style={{ margin: "0 0 4px", color: "var(--primary-dark)", fontSize: 20 }}>Olá, {meuPerfil?.nome?.split(" ")[0] || "corretor"}!</h2>
        <p style={{ margin: "0 0 1.5rem", color: "var(--text-muted)", fontSize: 14 }}>
          {disponiveis.length} {disponiveis.length === 1 ? "imóvel disponível" : "imóveis disponíveis"} no estoque da {EMPRESA.nome}
        </p>

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

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "4rem 0" }}>Nenhum imóvel encontrado.</div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {filtered.map(im => (
            <ImovelCard
              key={im.id}
              im={im}
              onClick={() => navigate(`/corretores/imovel/${im.id}`)}
              showStatus={false}
              actions={
                <button onClick={() => navigate(`/corretores/imovel/${im.id}`)} style={{
                  flex: 1, padding: "8px 0", fontSize: 13, borderRadius: 7,
                  border: "none", background: "var(--primary)", color: "#fff",
                  cursor: "pointer", fontWeight: 500
                }}>
                  Ver material
                </button>
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
