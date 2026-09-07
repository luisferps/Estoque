import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "../firebase";

// ─── Fonte compartilhada ───
// Uma coleção = UM listener só, dividido por todos os componentes que a usam.
// Antes cada componente abria o seu, e cada listener novo relia a coleção
// inteira no Firestore (abrir a lista, clicar em editar e voltar já custava
// três leituras completas). Era o que estourava a cota diária de leituras.
function criarFonte(montarQuery) {
  let dados = [];
  let carregado = false;
  let unsub = null;
  const inscritos = new Set();

  function avisar() {
    inscritos.forEach((fn) => fn());
  }

  function ligar() {
    if (unsub) return;
    unsub = onSnapshot(
      montarQuery(),
      (snap) => {
        dados = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        carregado = true;
        avisar();
      },
      () => {
        carregado = true;
        avisar();
      }
    );
  }

  return {
    // O listener fica vivo depois que o último componente sai: religar
    // custaria uma releitura da coleção inteira.
    inscrever(fn) {
      ligar();
      inscritos.add(fn);
      return () => {
        inscritos.delete(fn);
      };
    },
    estado() {
      return { dados, carregado };
    },
  };
}

function useFonte(fonte) {
  const [estado, setEstado] = useState(fonte.estado);

  useEffect(() => fonte.inscrever(() => setEstado(fonte.estado())), [fonte]);

  return estado;
}

const fonteImoveis = criarFonte(() =>
  query(collection(db, "imoveis"), orderBy("createdAt", "desc"))
);
const fonteCorretores = criarFonte(() => collection(db, "corretores"));

// ─── Hook que escuta a coleção de imóveis em tempo real ───
export function useImoveis() {
  const { dados, carregado } = useFonte(fonteImoveis);
  return { imoveis: dados, loading: !carregado };
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
  const { dados, carregado } = useFonte(fonteCorretores);
  return { corretores: dados, loading: !carregado };
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
