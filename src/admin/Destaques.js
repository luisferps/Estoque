import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useImoveis } from "../shared/hooks";
import { statusDoImovel } from "../shared/utils";
import { btnOutline, btnPrimary, inputBase, pageWrap, sectionBox } from "../shared/styles";

// Backend Railway (mesmo usado pelo CRM / WA Scheduler)
const WA_AGENT_URL = "https://agentes-de-whatsapp-production.up.railway.app";

const CANAL = "Canal Pro";

// Rótulos amigáveis dos níveis VRSync
const ROTULO_NIVEL = {
  STANDARD: "Sem destaque",
  PREMIUM: "Destaque",
  SUPER_PREMIUM: "Super Destaque",
  TRIPLE: "Destaque Triplo",
};
const COR_NIVEL = {
  STANDARD: { bg: "var(--bg-section)", fg: "var(--text-muted)" },
  PREMIUM: { bg: "#eff6ff", fg: "#1d4ed8" },
  SUPER_PREMIUM: { bg: "#f5f3ff", fg: "#7c3aed" },
  TRIPLE: { bg: "#fff7ed", fg: "#c2410c" },
};

// Hierarquia de níveis (do mais alto pro mais baixo) — usada pra rebaixar.
const NIVEL_ABAIXO = { TRIPLE: "SUPER_PREMIUM", SUPER_PREMIUM: "PREMIUM", PREMIUM: "" };
// Status que NÃO deveriam ocupar uma vaga de destaque paga.
const STATUS_NAO_VENDAVEL = ["vendido", "reservado"];

function fmtData(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}
function fmtDataCurta(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  } catch {
    return "—";
  }
}

export default function Destaques({ onLogout }) {
  const navigate = useNavigate();
  const { imoveis, loading } = useImoveis();

  const [busca, setBusca] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [cota, setCota] = useState({ premium: 0, superPremium: 0, triple: 0, intervaloDias: 3 });
  const [cotaSalva, setCotaSalva] = useState({ premium: 0, superPremium: 0, triple: 0, intervaloDias: 3 });
  const [carregandoCota, setCarregandoCota] = useState(true);
  const [salvandoCota, setSalvandoCota] = useState(false);

  // Relatório do backend (fila, histórico, última rotação)
  const [relatorio, setRelatorio] = useState(null);
  const [carregandoRel, setCarregandoRel] = useState(true);
  const [erroRel, setErroRel] = useState("");
  const [forcando, setForcando] = useState(false);
  const [toast, setToast] = useState("");

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  // Carrega a cota contratada (Firestore: configuracoes/destaquesCanalPro)
  useEffect(() => {
    (async () => {
      try {
        const ref = doc(db, "configuracoes", "destaquesCanalPro");
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const d = snap.data();
          const iv = Math.floor(Number(d.intervaloDias));
          const c = {
            premium: Number(d.premium) || 0,
            superPremium: Number(d.superPremium) || 0,
            triple: Number(d.triple) || 0,
            intervaloDias: iv >= 1 && iv <= 60 ? iv : 3,
          };
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

  // Carrega o relatório da rotação (backend)
  const carregarRelatorio = useCallback(async () => {
    setCarregandoRel(true);
    setErroRel("");
    try {
      const r = await fetch(`${WA_AGENT_URL}/destaques/relatorio`);
      const d = await r.json();
      if (d.ok) setRelatorio(d);
      else setErroRel(d.motivo || d.error || "Não foi possível carregar o relatório.");
    } catch (e) {
      setErroRel("Erro de conexão com o servidor da rotação.");
    } finally {
      setCarregandoRel(false);
    }
  }, []);

  useEffect(() => { carregarRelatorio(); }, [carregarRelatorio]);

  // Imóveis ativos no Canal Pro (os que vão pro feed)
  const noCanalPro = useMemo(
    () => imoveis.filter((im) => im.anuncios?.[CANAL]?.ativo),
    [imoveis]
  );

  // Indexa o relatório por id pra cruzar com a lista de imóveis
  const filaPorId = useMemo(() => {
    const m = new Map();
    (relatorio?.todos_na_fila || []).forEach((x) => m.set(x.id, x));
    return m;
  }, [relatorio]);

  // Contadores de uso atual (quantos estão em cada nível agora)
  const usados = useMemo(() => {
    let premium = 0, superPremium = 0, triple = 0;
    noCanalPro.forEach((im) => {
      const v = String(im.destaqueCanalPro || "STANDARD").toUpperCase();
      if (v === "PREMIUM") premium++;
      else if (v === "SUPER_PREMIUM") superPremium++;
      else if (v === "TRIPLE") triple++;
    });
    return { premium, superPremium, triple };
  }, [noCanalPro]);

  // Quantos estão FIXADOS em cada nível (fora do rodízio)
  const fixos = useMemo(() => {
    let premium = 0, superPremium = 0, triple = 0;
    noCanalPro.forEach((im) => {
      const v = String(im.destaqueFixo || "").toUpperCase();
      if (v === "PREMIUM") premium++;
      else if (v === "SUPER_PREMIUM") superPremium++;
      else if (v === "TRIPLE") triple++;
    });
    return { premium, superPremium, triple };
  }, [noCanalPro]);

  // ── Alertas de vaga (dinheiro/configuração) ──────────────────────────────
  // 1) Vaga DESPERDIÇADA: imóvel destacado mas Vendido/Reservado (paga vaga à toa)
  const vagasDesperdicadas = useMemo(() => {
    return noCanalPro.filter((im) => {
      const nivel = String(im.destaqueCanalPro || "STANDARD").toUpperCase();
      if (nivel === "STANDARD") return false;
      const st = statusDoImovel(im).toLowerCase();
      return STATUS_NAO_VENDAVEL.some((s) => st.includes(s));
    });
  }, [noCanalPro]);

  // 2) Vaga VAZIA: cota paga maior que o uso atual (sobra vaga comprada)
  const vagasVazias = useMemo(() => {
    const itens = [];
    const livresP = (Number(cota.premium) || 0) - usados.premium;
    const livresSP = (Number(cota.superPremium) || 0) - usados.superPremium;
    const livresT = (Number(cota.triple) || 0) - usados.triple;
    if (livresP > 0) itens.push({ nivel: "Destaque", n: livresP });
    if (livresSP > 0) itens.push({ nivel: "Super Destaque", n: livresSP });
    if (livresT > 0) itens.push({ nivel: "Destaque Triplo", n: livresT });
    return itens;
  }, [cota, usados]);

  // 3) Vaga ESTOURADA: imóvel FIXADO num nível acima da cota atual (cota encolheu)
  const vagasEstouradas = useMemo(() => {
    const out = [];
    const niveis = [
      { key: "TRIPLE", rotulo: "Destaque Triplo", cota: Number(cota.triple) || 0 },
      { key: "SUPER_PREMIUM", rotulo: "Super Destaque", cota: Number(cota.superPremium) || 0 },
      { key: "PREMIUM", rotulo: "Destaque", cota: Number(cota.premium) || 0 },
    ];
    niveis.forEach(({ key, rotulo, cota: ct }) => {
      const fixadosNoNivel = noCanalPro.filter(
        (im) => String(im.destaqueFixo || "").toUpperCase() === key
      );
      const excedente = fixadosNoNivel.length - ct;
      if (excedente > 0) {
        // Os "últimos" fixados são os excedentes (ordem por última vez em destaque)
        const ordenados = fixadosNoNivel.slice().sort((a, b) => {
          const da = new Date(a.ultimoDestaque || 0).getTime();
          const db = new Date(b.ultimoDestaque || 0).getTime();
          return db - da;
        });
        out.push({ key, rotulo, cota: ct, fixados: fixadosNoNivel.length, excedente, imoveis: ordenados });
      }
    });
    return out;
  }, [noCanalPro, cota]);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const base = filtroEstado === "todos" ? noCanalPro
      : filtroEstado === "destacados" ? noCanalPro.filter((im) => String(im.destaqueCanalPro || "STANDARD").toUpperCase() !== "STANDARD")
      : filtroEstado === "fixados" ? noCanalPro.filter((im) => ["PREMIUM","SUPER_PREMIUM","TRIPLE"].includes(String(im.destaqueFixo || "").toUpperCase()))
      : filtroEstado === "nunca" ? noCanalPro.filter((im) => !(im.ultimoDestaque || filaPorId.get(im.id)?.ultimoDestaque))
      : noCanalPro;
    const arr = !t
      ? base
      : base.filter((im) =>
          [im.titulo, im.bairro, im.cidade, im.tipo, im.codigo]
            .filter(Boolean)
            .some((c) => String(c).toLowerCase().includes(t))
        );
    // Ordena pela posição na fila (quem entra antes primeiro); destacados agora vão pro topo
    const ehFixo = (im) => (["PREMIUM", "SUPER_PREMIUM", "TRIPLE"].includes(String(im.destaqueFixo || "").toUpperCase()) ? 0 : 1);
    return arr.slice().sort((a, b) => {
      const xa = ehFixo(a), xb = ehFixo(b);
      if (xa !== xb) return xa - xb; // fixados primeiro
      const fa = filaPorId.get(a.id);
      const fb = filaPorId.get(b.id);
      const na = String(a.destaqueCanalPro || "STANDARD").toUpperCase() !== "STANDARD" ? 0 : 1;
      const nb = String(b.destaqueCanalPro || "STANDARD").toUpperCase() !== "STANDARD" ? 0 : 1;
      if (na !== nb) return na - nb;
      const pa = fa?.posicao ?? 99999;
      const pb = fb?.posicao ?? 99999;
      return pa - pb;
    });
  }, [noCanalPro, busca, filaPorId]);

  const salvarCota = async () => {
    setSalvandoCota(true);
    try {
      const ref = doc(db, "configuracoes", "destaquesCanalPro");
      const iv = Math.floor(Number(cota.intervaloDias));
      const c = {
        premium: Number(cota.premium) || 0,
        superPremium: Number(cota.superPremium) || 0,
        triple: Number(cota.triple) || 0,
        intervaloDias: iv >= 1 && iv <= 60 ? iv : 3,
      };
      await setDoc(ref, c, { merge: true });
      setCotaSalva(c);
      setCota(c);
      showToast("Configurações salvas ✓");
      carregarRelatorio();
    } catch (e) {
      alert("Erro ao salvar: " + e.message);
    } finally {
      setSalvandoCota(false);
    }
  };

  const forcarRotacao = async () => {
    if (!window.confirm("Forçar uma rotação de destaques agora?\nIsso vai revezar os imóveis destacados no Canal Pro imediatamente.\n\nO portal leva algumas horas pra refletir a mudança.")) return;
    setForcando(true);
    try {
      const r = await fetch(`${WA_AGENT_URL}/destaques/rotacionar`, { method: "POST" });
      const d = await r.json();
      if (d.ok) {
        showToast(`Rotação feita: ${d.aplicados || 0} destacados ✓`);
        carregarRelatorio();
      } else {
        showToast(d.error || "Erro ao rotacionar");
      }
    } catch (e) {
      showToast("Erro ao rotacionar");
    } finally {
      setForcando(false);
    }
  };

  const fixar = async (id, nivel) => {
    try {
      const r = await fetch(`${WA_AGENT_URL}/destaques/fixar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, nivel }),
      });
      const d = await r.json();
      if (d.ok) {
        showToast(nivel ? "Imóvel fixado ✓" : "Fixação removida ✓");
        carregarRelatorio();
      } else {
        showToast(d.error || "Erro ao fixar");
      }
    } catch (e) {
      showToast("Erro ao fixar");
    }
  };

  // Rebaixa um imóvel fixado pro nível imediatamente abaixo (Triplo→Super→Destaque→Sem).
  const rebaixar = async (id, nivelAtual) => {
    const abaixo = NIVEL_ABAIXO[String(nivelAtual || "").toUpperCase()] ?? "";
    const rotulo = abaixo ? (ROTULO_NIVEL[abaixo] || abaixo) : "Sem destaque (volta ao rodízio)";
    if (!window.confirm(`Rebaixar este imóvel para "${rotulo}"?`)) return;
    await fixar(id, abaixo);
  };

  const cotaMudou = cota.premium !== cotaSalva.premium || cota.superPremium !== cotaSalva.superPremium || cota.triple !== cotaSalva.triple || cota.intervaloDias !== cotaSalva.intervaloDias;

  // Calcula a próxima rotação prevista (última + intervalo de dias)
  const proximaRotacao = useMemo(() => {
    if (!relatorio?.ultima_rotacao || !relatorio?.intervalo_dias) return null;
    const base = new Date(relatorio.ultima_rotacao).getTime();
    return new Date(base + relatorio.intervalo_dias * 24 * 60 * 60 * 1000).toISOString();
  }, [relatorio]);

  return (
    <div style={pageWrap(1000)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: "var(--primary-dark)" }}>
          ⭐ Destaques — Canal Pro
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => navigate("/admin")} style={btnOutline}>← Voltar</button>
          <button onClick={() => navigate("/admin/anuncios")} style={btnOutline}>Anúncios</button>
          <button onClick={() => { carregarRelatorio(); }} style={btnOutline}>🔄 Atualizar</button>
          {onLogout && (
            <button onClick={onLogout} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer" }}>Sair</button>
          )}
        </div>
      </div>

      <p style={{ fontSize: 13, color: "var(--text-soft)", marginTop: 0 }}>
        Os destaques do Canal Pro são revezados <strong>automaticamente</strong> pelo sistema, de forma
        rotativa entre os imóveis ativos. Esta tela é de <strong>acompanhamento</strong>: mostra quem está
        destacado agora, quando cada imóvel foi destaque e a posição dele na fila. O portal relê o feed a
        cada 12h, então mudanças levam algumas horas pra aparecer no ZAP/Viva/OLX.
      </p>

      {/* ── ALERTAS DE VAGA ───────────────────────────────────────────── */}
      {/* Vaga estourada: imóvel fixado acima da cota atual */}
      {vagasEstouradas.length > 0 && (
        <div style={{ background: "#fef2f2", border: "1px solid #dc2626", borderRadius: 12, padding: "14px 16px", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: "#991b1b", marginBottom: 8, fontSize: 14 }}>
            ⚠️ Imóveis fixados acima da cota
          </div>
          <div style={{ fontSize: 12.5, color: "#7f1d1d", marginBottom: 10, lineHeight: 1.5 }}>
            Sua cota mudou e alguns imóveis fixados não cabem mais no nível em que estão. Rebaixe-os para não ficar com configuração inválida.
          </div>
          {vagasEstouradas.map((v) => (
            <div key={v.key} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "#991b1b", marginBottom: 6 }}>
                {v.rotulo}: {v.fixados} fixado(s), cota {v.cota} → {v.excedente} excedente(s)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {v.imoveis.slice(0, v.excedente).map((im) => (
                  <div key={im.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg-card)", borderRadius: 8, padding: "7px 10px", flexWrap: "wrap" }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {im.titulo || im.bairro || im.id}
                      {im.codigo ? ` · cód. ${im.codigo}` : ""}
                    </span>
                    <button onClick={() => rebaixar(im.id, v.key)}
                      style={{ fontSize: 12, padding: "5px 12px", borderRadius: 7, border: "none", background: "#dc2626", color: "#fff", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
                      Rebaixar para {NIVEL_ABAIXO[v.key] ? (ROTULO_NIVEL[NIVEL_ABAIXO[v.key]]) : "Sem destaque"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Vaga desperdiçada: imóvel vendido/reservado ainda destacado */}
      {vagasDesperdicadas.length > 0 && (
        <div style={{ background: "#fff7ed", border: "1px solid #ea580c", borderRadius: 12, padding: "14px 16px", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: "#9a3412", marginBottom: 8, fontSize: 14 }}>
            💸 Vaga de destaque desperdiçada
          </div>
          <div style={{ fontSize: 12.5, color: "#7c2d12", marginBottom: 10, lineHeight: 1.5 }}>
            {vagasDesperdicadas.length} imóvel(is) já vendido(s)/reservado(s) ainda ocupam uma vaga paga. Tire o destaque para liberar a vaga para outro imóvel.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {vagasDesperdicadas.map((im) => {
              const nivel = String(im.destaqueCanalPro || "STANDARD").toUpperCase();
              const ehFixo = ["PREMIUM","SUPER_PREMIUM","TRIPLE"].includes(String(im.destaqueFixo || "").toUpperCase());
              return (
                <div key={im.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg-card)", borderRadius: 8, padding: "7px 10px", flexWrap: "wrap" }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--text)" }}>
                    {im.titulo || im.bairro || im.id}
                    <span style={{ color: "#ea580c", fontWeight: 600 }}> · {statusDoImovel(im)}</span>
                    <span style={{ color: "var(--text-muted)" }}> · {ROTULO_NIVEL[nivel] || nivel}</span>
                  </span>
                  {ehFixo && (
                    <button onClick={() => fixar(im.id, "")}
                      style={{ fontSize: 12, padding: "5px 12px", borderRadius: 7, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer", fontWeight: 600 }}>
                      Desfixar
                    </button>
                  )}
                  <button onClick={() => navigate(`/admin/editar/${im.id}`)}
                    style={{ fontSize: 12, padding: "5px 12px", borderRadius: 7, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer" }}>
                    Ver ficha
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Vaga vazia: cota paga sobrando */}
      {vagasVazias.length > 0 && (
        <div style={{ background: "#eff6ff", border: "1px solid #2563eb", borderRadius: 12, padding: "12px 16px", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: "#1e40af", marginBottom: 4, fontSize: 14 }}>
            🎯 Vagas de destaque livres
          </div>
          <div style={{ fontSize: 12.5, color: "#1e3a8a", lineHeight: 1.5 }}>
            Você tem vagas pagas sem uso: {vagasVazias.map((v) => `${v.n} ${v.nivel}`).join(", ")}. Fixe mais imóveis para aproveitar o que já contratou.
          </div>
        </div>
      )}

      {/* Status da rotação */}
      <div style={sectionBox}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 600, color: "var(--primary-dark)", marginBottom: 6 }}>Status da rotação</div>
            {carregandoRel ? (
              <div style={{ fontSize: 13, color: "var(--text-soft)" }}>Carregando…</div>
            ) : erroRel ? (
              <div style={{ fontSize: 13, color: "#c0392b" }}>{erroRel}</div>
            ) : (
              <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.7 }}>
                <div>Última rotação: <strong>{fmtData(relatorio?.ultima_rotacao)}</strong></div>
                <div>Próxima prevista: <strong>{fmtData(proximaRotacao)}</strong> <span style={{ color: "var(--text-soft)" }}>(a cada {relatorio?.intervalo_dias || "?"} dias)</span></div>
                <div style={{ color: "var(--text-soft)" }}>
                  {relatorio?.total_elegiveis || 0} imóveis na rotação · {relatorio?.cota?.total || 0} vagas de destaque
                </div>
              </div>
            )}
          </div>
          <button onClick={forcarRotacao} disabled={forcando}
            style={{ ...btnPrimary, opacity: forcando ? 0.5 : 1, cursor: forcando ? "default" : "pointer" }}>
            {forcando ? "Rotacionando…" : "⚡ Forçar rotação agora"}
          </button>
        </div>
      </div>

      {/* Cota do mês + contadores */}
      <div style={sectionBox}>
        <div style={{ fontWeight: 600, color: "var(--primary-dark)", marginBottom: 10 }}>
          Cota contratada deste mês
        </div>
        {carregandoCota ? (
          <div style={{ fontSize: 13, color: "var(--text-soft)" }}>Carregando cota…</div>
        ) : (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
            <CampoCota rotulo="Destaques" valor={cota.premium} onChange={(v) => setCota((c) => ({ ...c, premium: v }))} usado={usados.premium} />
            <CampoCota rotulo="Super Destaques" valor={cota.superPremium} onChange={(v) => setCota((c) => ({ ...c, superPremium: v }))} usado={usados.superPremium} />
            <CampoCota rotulo="Destaques Triplos" valor={cota.triple} onChange={(v) => setCota((c) => ({ ...c, triple: v }))} usado={usados.triple} />
          </div>
        )}
      </div>

      {/* Intervalo da rotação */}
      <div style={sectionBox}>
        <div style={{ fontWeight: 600, color: "var(--primary-dark)", marginBottom: 6 }}>
          Frequência da rotação
        </div>
        <div style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 10 }}>
          De quantos em quantos dias o sistema revezar os destaques automaticamente. O padrão é 3 dias.
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ minWidth: 150 }}>
            <label style={{ fontSize: 12, color: "var(--text-soft)", display: "block", marginBottom: 4 }}>
              Rotacionar a cada (dias)
            </label>
            <input
              type="number"
              min={1}
              max={60}
              value={cota.intervaloDias}
              onChange={(e) => {
                const n = Math.floor(Number(e.target.value));
                setCota((c) => ({ ...c, intervaloDias: Number.isFinite(n) ? Math.min(60, Math.max(1, n)) : 1 }));
              }}
              style={{ ...inputBase, width: 110 }}
            />
          </div>
          <button onClick={salvarCota} disabled={!cotaMudou || salvandoCota}
            style={{ ...btnPrimary, opacity: !cotaMudou || salvandoCota ? 0.5 : 1, cursor: !cotaMudou || salvandoCota ? "default" : "pointer" }}>
            {salvandoCota ? "Salvando…" : "Salvar cota e frequência"}
          </button>
        </div>
      </div>

      {/* Histórico das rotações */}
      {relatorio?.historico?.length > 0 && (
        <div style={sectionBox}>
          <div style={{ fontWeight: 600, color: "var(--primary-dark)", marginBottom: 10 }}>
            📊 Últimas rotações
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {relatorio.historico.slice(0, 8).map((h) => (
              <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, padding: "6px 10px", background: "var(--bg-section)", borderRadius: 8 }}>
                <span style={{ minWidth: 110, color: "var(--text)" }}>{fmtData(h.quando)}</span>
                <span style={{ color: "var(--text-soft)" }}>
                  {h.aplicados} destacado(s){h.forcado ? " · manual" : ""}
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                  {(h.destacados || []).slice(0, 3).map((d) => d.titulo || d.id).join(" · ")}
                  {(h.destacados || []).length > 3 ? ` +${h.destacados.length - 3}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resumo de vagas por nível */}
      {!loading && noCanalPro.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {[
            ["Super Destaque", cota.superPremium, fixos.superPremium, usados.superPremium, COR_NIVEL.SUPER_PREMIUM],
            ["Destaque Triplo", cota.triple, fixos.triple, usados.triple, COR_NIVEL.TRIPLE],
            ["Destaque", cota.premium, fixos.premium, usados.premium, COR_NIVEL.PREMIUM],
          ].map(([nome, ct, fx, us, cor]) => {
            const livres = Math.max(0, (Number(ct) || 0) - (Number(us) || 0));
            const girando = Math.max(0, (Number(us) || 0) - (Number(fx) || 0));
            return (
              <div key={nome} style={{ flex: "1 1 180px", border: "1px solid var(--border-soft)", borderLeft: "4px solid " + ((cor && cor.fg) || "#999"), borderRadius: 10, padding: "8px 12px", background: "var(--bg-card)" }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{nome}</div>
                <div style={{ fontSize: 12, color: "var(--text-soft)", marginTop: 2 }}>
                  cota <b>{Number(ct) || 0}</b> · 📌 fixos <b>{fx}</b> · girando <b>{girando}</b> · livres <b style={{ color: livres > 0 ? "var(--primary)" : "var(--text-soft)" }}>{livres}</b>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Filtro de estado + Busca */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", fontSize: 13 }}>
          <option value="todos">Todos os imóveis</option>
          <option value="destacados">Só destacados agora</option>
          <option value="fixados">Só fixados</option>
          <option value="nunca">Nunca foram destaque</option>
        </select>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por título, bairro, cidade, tipo ou código…"
          style={{ ...inputBase, flex: "1 1 220px", marginBottom: 0 }}
        />
      </div>

      {loading ? (
        <div style={{ fontSize: 14, color: "var(--text-soft)" }}>Carregando imóveis…</div>
      ) : noCanalPro.length === 0 ? (
        <div style={{ fontSize: 14, color: "var(--text-soft)" }}>
          Nenhum imóvel está ativo no Canal Pro ainda. Ative os imóveis na tela de <b>Anúncios</b>.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 8 }}>
            {filtrados.length} de {noCanalPro.length} imóveis no Canal Pro
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtrados.map((im) => (
              <LinhaImovel key={im.id} im={im} info={filaPorId.get(im.id)} onFixar={fixar} navigate={navigate} />
            ))}
          </div>
        </>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", padding: "10px 18px", background: "var(--primary-light)", color: "var(--primary-dark)", border: "1px solid var(--primary)", borderRadius: 8, fontSize: 13, fontWeight: 500, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 100 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

function CampoCota({ rotulo, valor, onChange, usado }) {
  const excedeu = usado > (Number(valor) || 0);
  return (
    <div style={{ minWidth: 150 }}>
      <label style={{ fontSize: 12, color: "var(--text-soft)", display: "block", marginBottom: 4 }}>{rotulo}</label>
      <input type="number" min={0} value={valor}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        style={{ ...inputBase, width: 110 }} />
      <div style={{ fontSize: 12, marginTop: 4, fontWeight: 600, color: excedeu ? "#c0392b" : "var(--text-soft)" }}>
        Usados: {usado} de {Number(valor) || 0}{excedeu && " ⚠ acima da cota"}
      </div>
    </div>
  );
}

function LinhaImovel({ im, info, onFixar, navigate }) {
  const [salvando, setSalvando] = useState(false);
  const nivelAtual = String(im.destaqueCanalPro || "STANDARD").toUpperCase();
  const fixo = String(im.destaqueFixo || (info && info.fixo) || "").toUpperCase();
  const destacado = nivelAtual !== "STANDARD";
  const cor = COR_NIVEL[nivelAtual] || COR_NIVEL.STANDARD;
  const posicao = info?.posicao;
  const entraNaProxima = info?.entraNaProxima;
  // "ultimoDestaque" vem tanto do imóvel (Firebase) quanto do relatório
  const ultimo = info?.ultimoDestaque || im.ultimoDestaque || null;

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 12, padding: "10px 12px", borderRadius: 10, flexWrap: "wrap",
      background: "var(--bg-card)",
      border: destacado ? "1px solid var(--primary)" : "1px solid var(--border-soft)",
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis" }}>
          {im.titulo || im.bairro || "(sem título)"}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-soft)" }}>
          {[im.tipo, im.bairro, im.cidade].filter(Boolean).join(" · ")}
          {im.codigo ? `  ·  cód. ${im.codigo}` : ""}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
          Última vez em destaque: <strong>{fmtDataCurta(ultimo)}</strong>
        </div>
        <button onClick={() => navigate(`/admin/editar/${im.id}`)}
          style={{ marginTop: 5, fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer" }}>
          Ver ficha
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, minWidth: 150 }}>
        {/* Destaque atual */}
        <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: cor.bg, color: cor.fg }}>
          {destacado ? "⭐ " : ""}{ROTULO_NIVEL[nivelAtual] || nivelAtual}
        </span>
        {/* Posição na fila / próxima */}
        {destacado ? (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>destacado agora</span>
        ) : posicao ? (
          entraNaProxima ? (
            <span style={{ fontSize: 11, color: "var(--primary)", fontWeight: 600 }}>
              {posicao}º da fila · entra na próxima
            </span>
          ) : (
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {posicao}º da fila
            </span>
          )
        ) : (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>—</span>
        )}
        {fixo && (
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--primary-dark)" }}>📌 fixado: {ROTULO_NIVEL[fixo] || fixo}</span>
        )}
        <select
          value={fixo}
          disabled={salvando}
          title="Fixar este imóvel num nível (sai do rodízio e reserva a vaga)"
          onChange={async (e) => { setSalvando(true); await onFixar(im.id, e.target.value); setSalvando(false); }}
          style={{ fontSize: 11, padding: "3px 6px", borderRadius: 6, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: salvando ? "default" : "pointer" }}>
          <option value="">Não fixado (entra no rodízio)</option>
          <option value="PREMIUM">📌 Fixar como Destaque</option>
          <option value="SUPER_PREMIUM">📌 Fixar como Super Destaque</option>
          <option value="TRIPLE">📌 Fixar como Destaque Triplo</option>
        </select>
      </div>
    </div>
  );
}
