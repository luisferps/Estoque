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

// ─── Hook que escuta a coleção de tipos de imóvel ───
// Se a coleção estiver vazia, retorna os tipos padrão (fallback) pra nada quebrar.
const TIPOS_PADRAO = [
  { nome: "Lote", icone: "📐", comportamento: "terreno", ordem: 0 },
  { nome: "Casa", icone: "🏠", comportamento: "construcao", ordem: 1 },
  { nome: "Apartamento", icone: "🏢", comportamento: "construcao", ordem: 2 },
  { nome: "Área", icone: "🌳", comportamento: "terreno", ordem: 3 },
  { nome: "Galpão", icone: "🏭", comportamento: "simples", ordem: 4 },
];

export function useTipos() {
  const [tipos, setTipos] = useState(TIPOS_PADRAO);
  const [loading, setLoading] = useState(true);
  const [doBanco, setDoBanco] = useState(false);

  useEffect(() => {
    let ativo = true;
    // Fonte única: cadastro central (mesmo do CRM e do WA Scheduler).
    // Lido via endpoint do backend WA, que devolve { tipos: [{id, nome, comportamento, permite_condominio, ...}] }.
    fetch('https://agentes-de-whatsapp-production.up.railway.app/scheduler/tipos-imovel')
      .then(r => r.json())
      .then(data => {
        if (!ativo) return;
        const lista = Array.isArray(data?.tipos) ? data.tipos : [];
        if (lista.length) { setTipos(lista); setDoBanco(true); }
        else { setTipos(TIPOS_PADRAO); setDoBanco(false); }
        setLoading(false);
      })
      .catch(() => { if (ativo) { setTipos(TIPOS_PADRAO); setLoading(false); } });
    return () => { ativo = false; };
  }, []);

  return { tipos, loading, doBanco };
}
