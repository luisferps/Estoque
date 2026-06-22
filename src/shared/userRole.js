import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, onSnapshot, limit } from "firebase/firestore";
import { auth, db } from "../firebase";

// Hook que retorna o papel do usuário logado no Firebase Auth.
// Lê o documento da coleção "corretores" associado ao uid.
// Retorna: { user, perfil, isAdmin, isCorretor, loading }
// - user: objeto do Firebase Auth (ou null)
// - perfil: documento do Firestore com dados do corretor (ou null)
// - isAdmin: true se perfil.admin === true
// - isCorretor: true se está logado e tem perfil
export function useUserRole() {
  const [user, setUser] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubPerfil = null;
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (unsubPerfil) { unsubPerfil(); unsubPerfil = null; }
      if (!u) {
        setPerfil(null);
        setLoading(false);
        return;
      }
      // Busca o documento de corretor pelo uid
      const q = query(collection(db, "corretores"), where("uid", "==", u.uid), limit(1));
      unsubPerfil = onSnapshot(q, (snap) => {
        if (snap.empty) {
          setPerfil(null);
        } else {
          const d = snap.docs[0];
          setPerfil({ id: d.id, ...d.data() });
        }
        setLoading(false);
      }, () => setLoading(false));
    });
    return () => {
      if (unsubPerfil) unsubPerfil();
      unsubAuth();
    };
  }, []);

  const isAdmin = !!(perfil?.admin === true && perfil?.ativo !== false);
  const isCorretor = !!perfil;

  return { user, perfil, isAdmin, isCorretor, loading };
}

// Lê o perfil de quem entrou pelo Portal (admin_sso no localStorage).
// Retorna o papel: 'diretor' | 'gerente' | 'escritorio' | 'corretor' | null.
// Quem entra pelo Portal no Estoque é a equipe; o backend manda o papel real no SSO.
export function perfilSSO() {
  try {
    const raw = localStorage.getItem("admin_sso");
    if (!raw) return null;
    const d = JSON.parse(raw);
    return (d && d.perfil) ? String(d.perfil).toLowerCase() : null;
  } catch { return null; }
}

// Identidade de quem entrou pelo Portal (email), pra marcar "dono" do imóvel.
export function usuarioSSO() {
  try {
    const raw = localStorage.getItem("admin_sso");
    if (!raw) return null;
    const d = JSON.parse(raw);
    return (d && d.usuario) ? String(d.usuario).toLowerCase() : null;
  } catch { return null; }
}

// É diretor? (via Portal com perfil diretor). O diretor vê e edita tudo.
export function ehDiretorSSO() {
  return perfilSSO() === "diretor";
}

// Quem entrou pela senha mestra de backup (sem SSO do Portal) é o diretor — vê e edita tudo.
export function entrouPorSenhaBackup() {
  try {
    const temSenha = sessionStorage.getItem("admin") === "1" || localStorage.getItem("admin") === "1";
    const temSSO = !!localStorage.getItem("admin_sso");
    return temSenha && !temSSO;
  } catch { return false; }
}

// DECISÃO ÚNICA de "é diretor agora?". REGRA: o papel do PORTAL (SSO) MANDA.
// - Entrou pelo Portal (tem admin_sso) → vale SÓ o papel do SSO; o admin do Firebase
//   NÃO sobrepõe. (Evita a sessão Firebase de um diretor "vazar" e fazer um corretor
//   logado pelo Portal aparecer como diretor no mesmo navegador.)
// - Sem SSO → senha de backup OU admin do Firebase.
// Recebe o isAdmin do hook useUserRole (Firebase) como argumento.
export function ehDiretorEfetivo(isAdminFirebase) {
  try {
    if (localStorage.getItem("admin_sso")) return perfilSSO() === "diretor";
  } catch {}
  if (entrouPorSenhaBackup()) return true;
  return !!isAdminFirebase;
}
