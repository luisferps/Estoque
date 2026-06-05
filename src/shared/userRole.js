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
