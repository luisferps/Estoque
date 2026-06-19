import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { ThemeProvider } from "./shared/ThemeProvider";
import Galeria from "./shared/Galeria";

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

            {/* Admin */}
            <Route path="/admin" element={<AdminRoute element={AdminLista} />} />
            <Route path="/admin/novo" element={<AdminRoute element={AdminForm} />} />
            <Route path="/admin/editar/:id" element={<AdminRoute element={AdminForm} />} />
            <Route path="/admin/imovel/:id" element={<AdminRoute element={AdminDetalhe} />} />
            <Route path="/admin/consulta" element={<AdminRoute element={AdminConsulta} />} />
            <Route path="/admin/anuncios" element={<AdminRoute element={AdminAnuncios} />} />
            <Route path="/admin/corretores" element={<AdminRoute element={AdminCorretores} />} />
            <Route path="/admin/importar" element={<AdminRoute element={AdminImportar} />} />
            <Route path="/admin/tipos" element={<AdminRoute element={AdminTipos} />} />
            <Route path="/admin/rotacao" element={<AdminRoute element={AdminRotacao} />} />
            <Route path="/admin/destaques" element={<AdminRoute element={AdminDestaques} />} />

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

// ─── Guard de rotas do admin (SSO via Portal OU senha de backup, persistida em localStorage) ───
function AdminRoute({ element: Component }) {
  // Estado: null = ainda verificando SSO; true = liberado; false = mostra PassModal
  const [isAdmin, setIsAdmin] = useState(null);

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
            setIsAdmin(true);
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
        if (sso) { setIsAdmin(true); return; }
      } catch {}
      try {
        if (sessionStorage.getItem("admin") === "1" || localStorage.getItem("admin") === "1") { setIsAdmin(true); return; }
      } catch {}
      // 3) Nada — mostra PassModal
      setIsAdmin(false);
    }
  }, []);

  const onSuccess = () => {
    try { sessionStorage.setItem("admin", "1"); } catch {}
    setIsAdmin(true);
  };

  const onLogout = () => {
    try { sessionStorage.removeItem("admin"); localStorage.removeItem("admin"); localStorage.removeItem("admin_sso"); } catch {}
    setIsAdmin(false);
  };

  // Enquanto verifica SSO, evita piscar PassModal por meio segundo
  if (isAdmin === null) return null;

  if (!isAdmin) {
    return <PassModal onClose={() => { window.location.href = "/"; }} onSuccess={onSuccess} />;
  }

  return <Component onLogout={onLogout} />;
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
