import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "../firebase";

// ─── Hook que escuta a coleção de imóveis em tempo real ───
export function useImoveis() {
  const [imoveis, setImoveis] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "imoveis"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q,
      snap => { setImoveis(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  return { imoveis, loading };
}

// ─── Hook que retorna o usuário autenticado (Firebase Auth) ───
export function useAuthUser() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, u => { setUser(u); setLoading(false); });
  }, []);

  return { user, loading };
}

// ─── Hook que escuta a coleção de corretores ───
export function useCorretores() {
  const [corretores, setCorretores] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "corretores"),
      snap => { setCorretores(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  return { corretores, loading };
}


