import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams, useNavigate } from "react-router-dom";
import { ThemeProvider, DarkModeToggle } from "./shared/ThemeProvider";
import Galeria from "./shared/Galeria";
import { useUserRole, ehDiretorEfetivo } from "./shared/userRole";

// Público
import Home from "./publico/Home";
import ImovelPublico from "./publico/ImovelPublico";

// Admin
import AdminLista from "./admin/Lista";
import AdminForm from "./admin/Form";
import AdminDetalhe from "./admin/Detalhe";
import AdminAnuncios from "./admin/Anuncios";
import AdminCorretores from "./admin/Corretores";
import AdminImportar from "./admin/Importar";
import AdminTipos from "./admin/Tipos";
import AdminAjustes from "./admin/Ajustes";
import AdminRotacao from "./admin/Rotacao";
import AdminDestaques from "./admin/Destaques";
import PassModal from "./admin/PassModal";

// Corretores
import CorretorLogin from "./corretores/Login";
import CorretorDashboard from "./corretores/Dashboard";
import MaterialImovel from "./corretores/MaterialImovel";

// ─── Domínio oficial ───
// Se o site for acessado por qualquer outro domínio que não seja inerente.com.br,
// redireciona imediatamente para o domínio oficial (preservando o caminho).
const DOMINIO_OFICIAL = "inerente.com.br";

function DominioGuard() {
  useEffect(() => {
    const host = window.location.hostname;
    if (host !== DOMINIO_OFICIAL && host !== "www." + DOMINIO_OFICIAL) {
      window.location.replace(
        "https://" + DOMINIO_OFICIAL + window.location.pathname + window.location.search + window.location.hash
      );
    }
  }, []);
  return null;
}


// ─── Cabeçalho fixo do admin (aparece em todas as telas admin) ───
function AdminHeader({ onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin } = useUserRole();
  const ehDiretor = ehDiretorEfetivo(isAdmin);
  const loc = location.pathname;

  const abas = [
    { label: "🏠 Imóveis", path: "/admin" },
    ...(ehDiretor ? [
      { label: "📢 Anúncios", path: "/admin/anuncios" },
      { label: "⚙️ Ajustes", path: "/admin/ajustes" },
    ] : []),
    { label: "🌐 Site", path: "/", externo: true },
  ];

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 100, background: "var(--bg-card)", borderBottom: "1px solid var(--border-soft)", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "0 1rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0 4px", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "inline-flex", background: "var(--logo-bg)", borderRadius: 12, padding: "6px 12px" }}><img src="https://res.cloudinary.com/demsusjwf/image/upload/v1778785144/logo_png_fuv27j.png" alt="Inerente" style={{ height: "clamp(56px, 13vw, 104px)", width: "auto", display: "block" }} /></div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <DarkModeToggle />
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{ehDiretor ? "Diretor" : "Corretor"}</span>
            {onLogout && <button onClick={onLogout} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 7, border: "1px solid var(--border-soft)", background: "var(--bg-muted)", color: "var(--text)", cursor: "pointer" }}>Sair</button>}
            <button onClick={() => navigate("/admin/novo")} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 7, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontWeight: 700 }}>+ Novo</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 0, overflowX: "auto", scrollbarWidth: "none" }}>
          {abas.map(aba => (
            <button key={aba.path} onClick={() => aba.externo ? window.open("/", "_blank") : navigate(aba.path)}
              style={{
                padding: "7px 13px", fontSize: 12, fontWeight: 600, border: "none",
                background: "none", cursor: "pointer", whiteSpace: "nowrap",
                borderBottom: loc === aba.path ? "2px solid var(--primary)" : "2px solid transparent",
                color: loc === aba.path ? "var(--primary)" : "var(--text-soft)",
                borderRadius: 0, flexShrink: 0,
              }}>
              {aba.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <DominioGuard />
      <BrowserRouter>
        <GaleriaHashRouter>
          <Routes>
            {/* Site público */}
            <Route path="/" element={<Home />} />
            <Route path="/imovel/:id" element={<ImovelPublico />} />
            <Route path="/fotos/:id" element={<FotosRoute />} />

            {/* Admin — toda a equipe (autenticada) */}
            <Route path="/admin" element={<AdminRoute element={AdminLista} />} />
            <Route path="/admin/novo" element={<AdminRoute element={AdminForm} />} />
            <Route path="/admin/editar/:id" element={<AdminRoute element={AdminForm} />} />
            <Route path="/admin/imovel/:id" element={<AdminRoute element={AdminDetalhe} />} />
            <Route path="/admin/consulta" element={<Navigate to="/admin" replace />} />

            {/* Admin — SÓ DIRETOR (rotas restritas por papel) */}
            <Route path="/admin/anuncios" element={<AdminRoute element={AdminAnuncios} requireDiretor />} />
            <Route path="/admin/corretores" element={<AdminRoute element={AdminCorretores} requireDiretor />} />
            <Route path="/admin/importar" element={<AdminRoute element={AdminImportar} requireDiretor />} />
            <Route path="/admin/tipos" element={<AdminRoute element={AdminTipos} requireDiretor />} />
            <Route path="/admin/ajustes" element={<AdminRoute element={AdminAjustes} requireDiretor />} />
            <Route path="/admin/rotacao" element={<AdminRoute element={AdminRotacao} requireDiretor />} />
            <Route path="/admin/destaques" element={<AdminRoute element={AdminDestaques} requireDiretor />} />

            {/* Corretores */}
            <Route path="/corretores" element={<CorretorLogin />} />
            <Route path="/corretores/painel" element={<CorretorDashboard />} />
            <Route path="/corretores/imovel/:id" element={<MaterialImovel />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </GaleriaHashRouter>
      </BrowserRouter>
    </ThemeProvider>
  );
}

// ─── Guard de rotas do admin ───
function AdminRoute({ element: Component, requireDiretor = false }) {
  const [isAuth, setIsAuth] = useState(null);
  const { isAdmin, loading: loadingRole } = useUserRole();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenSSO = params.get("sso");
    if (tokenSSO) {
      fetch("https://agentes-de-whatsapp-production.up.railway.app/painel/sso-resgatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenSSO, sistema: "estoque" })
      })
        .then(r => r.json())
        .then(j => {
          if (j && j.ok && j.sessao) {
            try { localStorage.setItem("admin_sso", JSON.stringify({ usuario: j.usuario, nome: j.nome, perfil: j.perfil, cpf: j.cpf || "", sessao: j.sessao })); } catch {}
            try { window.history.replaceState(null, "", window.location.pathname + window.location.hash); } catch {}
            setIsAuth(true);
          } else {
            verificarSessaoLocal();
          }
        })
        .catch(() => verificarSessaoLocal());
      return;
    }
    verificarSessaoLocal();

    function verificarSessaoLocal() {
      try {
        const sso = localStorage.getItem("admin_sso");
        if (sso) { setIsAuth(true); return; }
      } catch {}
      try {
        if (sessionStorage.getItem("admin") === "1" || localStorage.getItem("admin") === "1") { setIsAuth(true); return; }
      } catch {}
      setIsAuth(false);
    }
  }, []);

  const onSuccess = () => {
    try { sessionStorage.setItem("admin", "1"); } catch {}
    setIsAuth(true);
  };

  const onLogout = () => {
    try { sessionStorage.removeItem("admin"); localStorage.removeItem("admin"); localStorage.removeItem("admin_sso"); } catch {}
    setIsAuth(false);
  };

  if (isAuth === null) return null;

  if (!isAuth) {
    return <PassModal onClose={() => { window.location.href = "/"; }} onSuccess={onSuccess} />;
  }

  if (requireDiretor) {
    const ehDiretor = ehDiretorEfetivo(isAdmin);
    if (!ehDiretor) {
      if (loadingRole) return <TelaVerificando />;
      return <AcessoRestrito />;
    }
  }

  return (
    <>
      <AdminHeader onLogout={onLogout} />
      <Component onLogout={onLogout} />
    </>
  );
}

function TelaVerificando() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-soft, #6b7280)", fontSize: 14, fontFamily: "sans-serif" }}>
      Verificando acesso…
    </div>
  );
}

function AcessoRestrito() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center", fontFamily: "sans-serif" }}>
      <div style={{ fontSize: 44 }}>🔒</div>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--primary-dark, #1a1a2e)" }}>Acesso restrito</h2>
      <p style={{ margin: 0, maxWidth: 380, color: "var(--text-soft, #6b7280)", fontSize: 14, lineHeight: 1.5 }}>
        Esta área é exclusiva da diretoria. Se você precisa acessá-la, fale com a diretoria.
      </p>
      <button
        onClick={() => { window.location.href = "/admin"; }}
        style={{ marginTop: 4, padding: "10px 18px", borderRadius: 8, border: "none", background: "var(--primary, #C0392B)", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
      >
        Voltar ao painel
      </button>
    </div>
  );
}

function FotosRoute() {
  const { id } = useParams();
  return <Galeria id={id} />;
}

function GaleriaHashRouter({ children }) {
  const location = useLocation();
  const [galeriaId, setGaleriaId] = useState(() => {
    const hash = window.location.hash;
    return hash.startsWith("#galeria-") ? hash.replace("#galeria-", "") : null;
  });

  useEffect(() => {
    const check = () => {
      const hash = window.location.hash;
      if (hash.startsWith("#galeria-")) setGaleriaId(hash.replace("#galeria-", ""));
      else setGaleriaId(null);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [location]);

  if (galeriaId) return <Galeria id={galeriaId} />;
  return children;
}
