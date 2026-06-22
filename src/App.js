import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { ThemeProvider } from "./shared/ThemeProvider";
import Galeria from "./shared/Galeria";
import { useUserRole, ehDiretorEfetivo } from "./shared/userRole";

// Público
import Home from "./publico/Home";
import ImovelPublico from "./publico/ImovelPublico";

// Admin
import AdminLista from "./admin/Lista";
import AdminForm from "./admin/Form";
import AdminDetalhe from "./admin/Detalhe";
import AdminConsulta from "./admin/Consulta";
import AdminAnuncios from "./admin/Anuncios";
import AdminCorretores from "./admin/Corretores";
import AdminImportar from "./admin/Importar";
import AdminTipos from "./admin/Tipos";
import AdminRotacao from "./admin/Rotacao";
import AdminDestaques from "./admin/Destaques";
import PassModal from "./admin/PassModal";

// Corretores
import CorretorLogin from "./corretores/Login";
import CorretorDashboard from "./corretores/Dashboard";
import MaterialImovel from "./corretores/MaterialImovel";

export default function App() {
  return (
    <ThemeProvider>
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
            <Route path="/admin/consulta" element={<AdminRoute element={AdminConsulta} />} />

            {/* Admin — SÓ DIRETOR (rotas restritas por papel) */}
            <Route path="/admin/anuncios" element={<AdminRoute element={AdminAnuncios} requireDiretor />} />
            <Route path="/admin/corretores" element={<AdminRoute element={AdminCorretores} requireDiretor />} />
            <Route path="/admin/importar" element={<AdminRoute element={AdminImportar} requireDiretor />} />
            <Route path="/admin/tipos" element={<AdminRoute element={AdminTipos} requireDiretor />} />
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
// Autentica (SSO via Portal OU senha de backup, persistida em localStorage) e,
// quando a rota pede (requireDiretor), valida também o PAPEL antes de liberar.
function AdminRoute({ element: Component, requireDiretor = false }) {
  // Estado de autenticação: null = ainda verificando SSO; true = autenticado; false = mostra PassModal
  const [isAuth, setIsAuth] = useState(null);
  // Papel via Firebase (complementa o papel que vem do SSO do Portal). Sempre chamado (regra de hooks).
  const { isAdmin, loading: loadingRole } = useUserRole();

  useEffect(() => {
    // 1) Tem ?sso=token na URL? troca por sessão no backend.
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
            try { localStorage.setItem("admin_sso", JSON.stringify({ usuario: j.usuario, nome: j.nome, perfil: j.perfil, sessao: j.sessao })); } catch {}
            // Limpa o ?sso= da URL pra não ficar exposto
            try { window.history.replaceState(null, "", window.location.pathname + window.location.hash); } catch {}
            setIsAuth(true);
          } else {
            // SSO falhou — cai pra verificar sessão local / pedir senha
            verificarSessaoLocal();
          }
        })
        .catch(() => verificarSessaoLocal());
      return;
    }
    verificarSessaoLocal();

    function verificarSessaoLocal() {
      // 2) Tem sessão local salva (SSO anterior ou senha)? libera.
      try {
        const sso = localStorage.getItem("admin_sso");
        if (sso) { setIsAuth(true); return; }
      } catch {}
      try {
        if (sessionStorage.getItem("admin") === "1" || localStorage.getItem("admin") === "1") { setIsAuth(true); return; }
      } catch {}
      // 3) Nada — mostra PassModal
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

  // Enquanto verifica SSO, evita piscar PassModal por meio segundo
  if (isAuth === null) return null;

  if (!isAuth) {
    return <PassModal onClose={() => { window.location.href = "/"; }} onSuccess={onSuccess} />;
  }

  // ─── Autenticado. Se a rota é restrita a diretor, valida o papel. ───
  if (requireDiretor) {
    const ehDiretor = ehDiretorEfetivo(isAdmin);
    if (!ehDiretor) {
      // Pode ser que o papel via Firebase ainda esteja carregando — espera antes de bloquear,
      // pra nunca trancar um diretor por engano (evita falso negativo).
      if (loadingRole) return <TelaVerificando />;
      return <AcessoRestrito />;
    }
  }

  return <Component onLogout={onLogout} />;
}

// ─── Telinha enquanto confirma o papel (some rápido) ───
function TelaVerificando() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-soft, #6b7280)", fontSize: 14, fontFamily: "sans-serif" }}>
      Verificando acesso…
    </div>
  );
}

// ─── Tela de acesso restrito (corretor/gerente tentou uma rota só de diretor) ───
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

// ─── Galeria por rota /fotos/:id (com preview de foto no WhatsApp via Edge Function) ───
function FotosRoute() {
  const { id } = useParams();
  return <Galeria id={id} />;
}

// ─── Suporte ao hash legado #galeria-ID ───
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
