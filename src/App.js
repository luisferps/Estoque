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

// ─── Guard de rotas do admin (senha local, persistida em sessionStorage) ───
function AdminRoute({ element: Component }) {
  const [isAdmin, setIsAdmin] = useState(() => {
    try { return sessionStorage.getItem("admin") === "1"; } catch { return false; }
  });

  const onSuccess = () => {
    try { sessionStorage.setItem("admin", "1"); } catch {}
    setIsAdmin(true);
  };

  const onLogout = () => {
    try { sessionStorage.removeItem("admin"); } catch {}
    setIsAdmin(false);
  };

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
