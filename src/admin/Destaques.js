import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, updateDoc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useImoveis } from "../shared/hooks";
import { btnOutline, btnPrimary, inputBase, pageWrap, sectionBox } from "../shared/styles";

// Níveis de destaque do Canal Pro (valores VRSync prontos para o feed).
// Para adicionar Super Destaque / Premiere no futuro, basta incluir aqui.
const NIVEIS = [
  { valor: "STANDARD", rotulo: "Sem destaque", chaveCota: null },
  { valor: "PREMIUM", rotulo: "Destaque", chaveCota: "premium" },
  { valor: "TRIPLE", rotulo: "Destaque Triplo", chaveCota: "triple" },
];

const CANAL = "Canal Pro";

export default function Destaques({ onLogout }) {
  const navigate = useNavigate();
  const { imoveis, loading } = useImoveis();

  const [busca, setBusca] = useState("");
  const [cota, setCota] = useState({ premium: 0, triple: 0 });
  const [cotaSalva, setCotaSalva] = useState({ premium: 0, triple: 0 });
  const [carregandoCota, setCarregandoCota] = useState(true);
  const [salvandoCota, setSalvandoCota] = useState(false);

  // Carrega a cota contratada do mês (Firestore: configuracoes/destaquesCanalPro)
  useEffect(() => {
    (async () => {
      try {
        const ref = doc(db, "configuracoes", "destaquesCanalPro");
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const d = snap.data();
          const c = { premium: Number(d.premium) || 0, triple: Number(d.triple) || 0 };
          setCota(c);
          setCotaSalva(c);
        }
      } catch (e) {
        console.error("Erro ao carregar cota:", e);
      } finally {
        setCarregandoCota(false);
      }
    })();
  }, []);

  // Imóveis que estão ativos no Canal Pro (os que realmente vão pro feed)
  const noCanalPro = useMemo(
    () => imoveis.filter((im) => im.anuncios?.[CANAL]?.ativo),
    [imoveis]
  );

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return noCanalPro;
    return noCanalPro.filter((im) =>
      [im.titulo, im.bairro, im.cidade, im.tipo, im.codigo]
        .filter(Boolean)
        .some((c) => String(c).toLowerCase().includes(t))
    );
  }, [noCanalPro, busca]);

  // Contadores de uso atual
  const usados = useMemo(() => {
    let premium = 0;
    let triple = 0;
    noCanalPro.forEach((im) => {
      const v = String(im.destaqueCanalPro || "STANDARD").toUpperCase();
      if (v === "PREMIUM") premium++;
      else if (v === "TRIPLE") triple++;
    });
    return { premium, triple };
  }, [noCanalPro]);

  const alterarNivel = async (im, valor) => {
    try {
      await updateDoc(doc(db, "imoveis", im.id), { destaqueCanalPro: valor });
    } catch (e) {
      alert("Erro ao salvar destaque: " + e.message);
    }
  };

  const salvarCota = async () => {
    setSalvandoCota(true);
    try {
      const ref = doc(db, "configuracoes", "destaquesCanalPro");
      const c = { premium: Number(cota.premium) || 0, triple: Number(cota.triple) || 0 };
      await setDoc(ref, c, { merge: true });
      setCotaSalva(c);
    } catch (e) {
      alert("Erro ao salvar cota: " + e.message);
    } finally {
      setSalvandoCota(false);
    }
  };

  const cotaMudou = cota.premium !== cotaSalva.premium || cota.triple !== cotaSalva.triple;

  return (
    <div style={pageWrap(1000)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: "var(--primary-dark)" }}>
          ⭐ Destaques — Canal Pro
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => navigate("/admin")} style={btnOutline}>← Voltar</button>
          <button onClick={() => navigate("/admin/anuncios")} style={btnOutline}>Anúncios</button>
          {onLogout && (
            <button onClick={onLogout} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer" }}>Sair</button>
          )}
        </div>
      </div>

      <p style={{ fontSize: 13, color: "var(--text-soft)", marginTop: 0 }}>
        Escolha aqui quais anúncios saem com destaque no ZAP, Viva Real e OLX. O feed é relido
        pelo portal a cada 12h e respeita exatamente o que estiver marcado nesta tela — não é
        preciso mexer no painel do Canal Pro. Lembre-se de respeitar a grade contratada: destaques
        acima da cota são recusados pelo portal.
      </p>

      {/* Cota do mês + contadores */}
      <div style={sectionBox}>
        <div style={{ fontWeight: 600, color: "var(--primary-dark)", marginBottom: 10 }}>
          Cota contratada deste mês
        </div>
        {carregandoCota ? (
          <div style={{ fontSize: 13, color: "var(--text-soft)" }}>Carregando cota…</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
              <CampoCota
                rotulo="Destaques"
                valor={cota.premium}
                onChange={(v) => setCota((c) => ({ ...c, premium: v }))}
                usado={usados.premium}
              />
              <CampoCota
                rotulo="Destaques Triplos"
                valor={cota.triple}
                onChange={(v) => setCota((c) => ({ ...c, triple: v }))}
                usado={usados.triple}
              />
              <button
                onClick={salvarCota}
                disabled={!cotaMudou || salvandoCota}
                style={{ ...btnPrimary, opacity: !cotaMudou || salvandoCota ? 0.5 : 1, cursor: !cotaMudou || salvandoCota ? "default" : "pointer" }}
              >
                {salvandoCota ? "Salvando…" : "Salvar cota"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Busca */}
      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por título, bairro, cidade, tipo ou código…"
        style={{ ...inputBase, marginBottom: 12 }}
      />

      {loading ? (
        <div style={{ fontSize: 14, color: "var(--text-soft)" }}>Carregando imóveis…</div>
      ) : noCanalPro.length === 0 ? (
        <div style={{ fontSize: 14, color: "var(--text-soft)" }}>
          Nenhum imóvel está ativo no Canal Pro ainda. Ative os imóveis na tela de <b>Anúncios</b> para
          poder destacá-los aqui.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 8 }}>
            {filtrados.length} de {noCanalPro.length} imóveis no Canal Pro
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtrados.map((im) => (
              <LinhaImovel key={im.id} im={im} onAlterar={alterarNivel} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CampoCota({ rotulo, valor, onChange, usado }) {
  const excedeu = usado > (Number(valor) || 0);
  return (
    <div style={{ minWidth: 150 }}>
      <label style={{ fontSize: 12, color: "var(--text-soft)", display: "block", marginBottom: 4 }}>
        {rotulo}
      </label>
      <input
        type="number"
        min={0}
        value={valor}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        style={{ ...inputBase, width: 110 }}
      />
      <div style={{ fontSize: 12, marginTop: 4, fontWeight: 600, color: excedeu ? "#c0392b" : "var(--text-soft)" }}>
        Usados: {usado} de {Number(valor) || 0}
        {excedeu && " ⚠ acima da cota"}
      </div>
    </div>
  );
}

function LinhaImovel({ im, onAlterar }) {
  const nivelAtual = String(im.destaqueCanalPro || "STANDARD").toUpperCase();
  const destacado = nivelAtual !== "STANDARD";
  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, padding: "10px 12px", borderRadius: 10, flexWrap: "wrap",
        background: "var(--bg-card)",
        border: destacado ? "1px solid var(--primary)" : "1px solid var(--border-soft)",
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis" }}>
          {im.titulo || im.bairro || "(sem título)"}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-soft)" }}>
          {[im.tipo, im.bairro, im.cidade].filter(Boolean).join(" · ")}
          {im.codigo ? `  ·  cód. ${im.codigo}` : ""}
        </div>
      </div>
      <select
        value={NIVEIS.some((n) => n.valor === nivelAtual) ? nivelAtual : "STANDARD"}
        onChange={(e) => onAlterar(im, e.target.value)}
        style={{
          ...inputBase, width: "auto", minWidth: 170, cursor: "pointer",
          fontWeight: destacado ? 600 : 400,
          color: destacado ? "var(--primary-dark)" : "var(--text)",
        }}
      >
        {NIVEIS.map((n) => (
          <option key={n.valor} value={n.valor}>{n.rotulo}</option>
        ))}
      </select>
    </div>
  );
}
