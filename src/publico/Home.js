import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useImoveis, useTipos } from "../shared/hooks";
import { matchTransacao, ordenarImoveis, statusDoImovel, descricaoPronta, linkLocalizacao } from "../shared/utils";
import { EMPRESA, ORDENACOES, LOGO_URL } from "../constants";

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function emojiTipo(nome) {
  const n = semAcento(nome);
  if (n.includes("apart")) return "🏢";
  if (n.includes("sobrado")) return "🏡";
  if (n.includes("cobertura")) return "🏙️";
  if (n.includes("studio") || n.includes("kitnet") || n.includes("flat") || n.includes("loft")) return "🛏️";
  if (n.includes("lote comercial") || n.includes("area comercial") || n.includes("sala") || n.includes("loja") || n.includes("ponto")) return "🏬";
  if (n.includes("lote") || n.includes("terreno") || n.includes("area")) return "🟩";
  if (n.includes("fazenda") || n.includes("chacara") || n.includes("sitio") || n.includes("rural")) return "🌾";
  if (n.includes("galpao") || n.includes("deposito") || n.includes("armazem")) return "🏭";
  if (n.includes("predio") || n.includes("edificio")) return "🏗️";
  if (n.includes("casa")) return "🏠";
  return "🏘️";
}

const MODOS = [
  { key: "Todos", label: "Todos", icon: "🏘️" },
  { key: "Venda", label: "Comprar", icon: "🔑" },
  { key: "Locação", label: "Alugar", icon: "🗓️" },
];

const FAIXAS_FMT = (n) => n >= 1000000 ? `${(n / 1000000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi` : `${(n / 1000).toLocaleString("pt-BR")} mil`;
const FAIXAS_VENDA = [0, 200000, 350000, 500000, 750000, 1000000, 1500000, 2500000];
const FAIXAS_LOCACAO = [0, 1500, 2500, 4000, 6000, 10000];

function precoDoImovel(im) {
  if (im.transacao === "Locação") return parseFloat(im.valorFinal || im.valorAluguel) || 0;
  return parseFloat(im.preco) || 0;
}

// ─── Card de imóvel (estilo Apple: foto grande, cantos arredondados, hover suave) ───
function CardImovel({ im, onClick, onWhats, onShare, shareOpen, onCopiar, copiado }) {
  const codigo = (im.codigo == null ? "" : String(im.codigo)).trim().toUpperCase();
  const local = [im.bairro, im.cidade].filter(Boolean).join(", ");
  const tituloRaw = String(im.titulo == null ? "" : im.titulo).trim();
  const bairroRaw = String(im.bairro == null ? "" : im.bairro).trim();
  const titulo = tituloRaw || (im.tipo ? (bairroRaw ? `${im.tipo} em ${bairroRaw}` : im.tipo) : "Imóvel");
  const c = parseFloat(im.metragem) || parseFloat(im.metragemTotal) || 0;
  const m2 = c ? `${c.toLocaleString("pt-BR")} m²` : "";
  const q = parseInt(im.quartos) || 0;
  const su = parseInt(im.suites) || 0;
  const va = parseInt(im.garagens) || 0;
  const foto = im.fotos?.[0];
  const fotoThumb = (foto && foto.includes("res.cloudinary.com") && foto.includes("/upload/"))
    ? foto.replace("/upload/", "/upload/w_640,h_480,c_fill,f_auto,q_auto/") : foto;
  const ehLoc = im.transacao === "Locação";
  const preco = ehLoc ? (im.valorFinal || im.valorAluguel) : im.preco;
  const mapsLink = linkLocalizacao(im);
  const link = `${window.location.origin}/imovel/${im.id}`;
  const wa = `https://wa.me/${EMPRESA.whatsapp}?text=${encodeURIComponent(`Olá! Tenho interesse no imóvel: ${titulo}\n${link}`)}`;

  return (
    <div className="p-card">
      <div className="p-card-img" onClick={onClick}>
        {fotoThumb
          ? <img src={fotoThumb} alt="" loading="lazy" decoding="async" />
          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 52, opacity: 0.4 }}>🏠</div>}
        {im.tipo && (
          <span className="p-tag">{im.tipo}{im.transacao ? ` · ${im.transacao}` : ""}</span>
        )}
      </div>
      <div className="p-card-body">
        <div className="p-card-loc" onClick={onClick}>{codigo ? `CÓD ${codigo} · ` : ""}{local}</div>
        <div className="p-card-title" onClick={onClick}>{titulo}</div>
        <div className="p-card-specs" onClick={onClick}>
          {q > 0 && <span className="p-spec">🛏 {q} {q === 1 ? "quarto" : "quartos"}</span>}
          {su > 0 && <span className="p-spec">🚿 {su} {su === 1 ? "suíte" : "suítes"}</span>}
          {va > 0 && <span className="p-spec">🚗 {va} {va === 1 ? "vaga" : "vagas"}</span>}
          {m2 && <span className="p-spec">📐 {m2}</span>}
          {!(q || su || va) && im.asfalto && <span className="p-spec">📍 Asfalto</span>}
        </div>
        <div className="p-card-price" onClick={onClick}>
          {preco ? <>R$ {parseFloat(preco).toLocaleString("pt-BR")}{ehLoc && <small> /mês</small>}</> : <span style={{ fontSize: 15, color: "var(--text-muted)", fontWeight: 400 }}>Consulte</span>}
        </div>
        <div className="p-card-actions">
          <a href={wa} target="_blank" rel="noreferrer" className="p-wa-btn" onClick={e => e.stopPropagation()}>💬 WhatsApp</a>
          <div style={{ position: "relative", flex: 1 }}>
            <button className="p-share-btn" onClick={e => { e.stopPropagation(); onShare(); }}>↗ Compartilhar</button>
            {shareOpen && (
              <div className="p-popup" onClick={e => e.stopPropagation()}>
                <div onClick={() => { window.open(`https://wa.me/?text=${encodeURIComponent(`${titulo}\n${link}`)}`, "_blank"); onShare(); }} className="p-popup-item">💬 WhatsApp</div>
                {mapsLink && <a href={mapsLink} target="_blank" rel="noreferrer" className="p-popup-item" onClick={onShare}>📍 Localização no mapa</a>}
                <div onClick={() => { navigator.clipboard?.writeText(link); onShare(); }} className="p-popup-item">🔗 Copiar link</div>
                <div onClick={onCopiar} className="p-popup-item">{copiado ? "✓ Copiado!" : "📋 Copiar descrição"}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { imoveis, loading } = useImoveis();
  const { tipos } = useTipos();

  const [search, setSearch] = useState("");
  const [tipo, setTipo] = useState("Todos");
  const [transacao, setTransacao] = useState("Todos");
  const [valorMin, setValorMin] = useState("");
  const [valorMax, setValorMax] = useState("");
  const [ordem, setOrdem] = useState("recente");
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [shareOpenId, setShareOpenId] = useState(null);
  const [copiadoId, setCopiadoId] = useState(null);

  const publicos = useMemo(() => imoveis.filter(im => statusDoImovel(im) === "Disponível"), [imoveis]);
  const noModo = useMemo(() => publicos.filter(im => matchTransacao(im, transacao)), [publicos, transacao]);

  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    const els = document.querySelectorAll(".reveal:not(.on)");
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("on"); io.unobserve(e.target); } });
    }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [imoveis, transacao, tipo, search, valorMin, valorMax, ordem, filtroAberto]);

  const filtered = useMemo(() => {
    const qq = semAcento(search);
    const vMin = parseFloat(valorMin) || 0;
    const vMax = parseFloat(valorMax) || 0;
    const base = noModo.filter(im => {
      if (qq && !(semAcento(im.titulo).includes(qq) || semAcento(im.descricao).includes(qq) || semAcento(im.cidade).includes(qq) || semAcento(im.bairro).includes(qq))) return false;
      if (tipo !== "Todos" && im.tipo !== tipo) return false;
      if (vMin > 0 || vMax > 0) {
        const p = precoDoImovel(im);
        if (vMin > 0 && p && p < vMin) return false;
        if (vMax > 0 && p > vMax) return false;
      }
      return true;
    });
    return ordenarImoveis(base, ordem);
  }, [noModo, search, tipo, valorMin, valorMax, ordem]);

  const contagemPorTipo = useMemo(() => {
    const ct = {};
    noModo.forEach(im => { if (im.tipo) ct[im.tipo] = (ct[im.tipo] || 0) + 1; });
    return ct;
  }, [noModo]);

  const tiposVisiveis = useMemo(() => {
    return tipos.filter(t => (contagemPorTipo[t.nome] || 0) > 0).slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [tipos, contagemPorTipo]);

  const faixas = transacao === "Locação" ? FAIXAS_LOCACAO : FAIXAS_VENDA;
  const sufixoFaixa = transacao === "Locação" ? "/mês" : "";

  const copiarDescricao = async (im) => {
    try { await navigator.clipboard.writeText(descricaoPronta(im)); setCopiadoId(im.id); setTimeout(() => setCopiadoId(c => (c === im.id ? null : c)), 1800); } catch {
      const ta = document.createElement("textarea"); ta.value = descricaoPronta(im); document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); setCopiadoId(im.id); setTimeout(() => setCopiadoId(c => (c === im.id ? null : c)), 1800); } catch {}
      document.body.removeChild(ta);
    }
    setShareOpenId(null);
  };

  return (
    <div className="apple-site">
      <style>{`
        .apple-site { min-height: 100vh; background: #fff; color: var(--text); -webkit-font-smoothing: antialiased; }
        .apple-site * { box-sizing: border-box; }

        .a-nav { position: sticky; top: 0; z-index: 100; background: rgba(255,255,255,0.82); backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px); border-bottom: 1px solid var(--border); }
        .a-nav-inner { max-width: 1024px; margin: 0 auto; height: 56px; padding: 0 22px; display: flex; align-items: center; gap: 14px; }
        .a-logo { display: flex; align-items: center; gap: 9px; }
        .a-logo img { height: 26px; width: auto; display: block; }
        .a-logo b { font-size: 18px; font-weight: 600; letter-spacing: -0.02em; color: var(--primary-dark); }
        .a-logo em { font-style: normal; font-weight: 400; font-size: 14px; color: var(--text-soft); }
        @media (max-width: 540px) { .a-logo em { display: none; } }
        .a-nav-spacer { flex: 1; }
        .a-nav-cta { font-size: 13px; font-weight: 500; background: var(--primary); color: #fff; padding: 7px 16px; border-radius: 980px; text-decoration: none; transition: background .2s; }
        .a-nav-cta:hover { background: var(--primary-dark); }

        .a-hero { text-align: center; padding: 44px 22px 52px; background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 60%, #cf4636 100%); color: #fff; }
        .a-tabs { display: inline-flex; gap: 4px; background: rgba(255,255,255,0.16); padding: 5px; border-radius: 980px; backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.25); }
        .a-tab { font-size: 14px; font-weight: 500; padding: 9px 22px; border-radius: 980px; color: rgba(255,255,255,0.9); cursor: pointer; transition: all .25s; border: none; background: transparent; display: inline-flex; align-items: center; gap: 6px; }
        .a-tab.on { background: #fff; color: var(--primary-dark); font-weight: 600; box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
        .a-tab:not(.on):hover { background: rgba(255,255,255,0.12); }

        .a-search { max-width: 860px; margin: 26px auto 0; display: flex; gap: 8px; background: #fff; border: 1px solid var(--border); border-radius: 980px; padding: 7px 7px 7px 22px; box-shadow: 0 8px 30px rgba(0,0,0,0.16); align-items: center; flex-wrap: wrap; }
        .a-search input { flex: 1 1 180px; border: none; outline: none; font-size: 15px; color: var(--text); background: transparent; min-width: 80px; }
        .a-search input::placeholder { color: var(--text-muted); }
        .a-search select { border: none; outline: none; background: var(--bg-muted); border-radius: 980px; padding: 11px 16px; font-size: 14px; color: var(--text-soft); cursor: pointer; font-family: inherit; }
        .a-search .a-valor { border: none; background: var(--bg-muted); border-radius: 980px; padding: 11px 18px; font-size: 14px; color: var(--text-soft); cursor: pointer; white-space: nowrap; font-family: inherit; }
        .a-search .a-valor.on { background: var(--primary-light); color: var(--primary-dark); }
        .a-search .a-go { background: var(--primary); color: #fff; border: none; border-radius: 980px; padding: 11px 22px; font-size: 16px; cursor: pointer; }
        @media (max-width: 640px) { .a-search { border-radius: 24px; } .a-search input { flex: 1 1 100%; } .a-search select, .a-search .a-valor { flex: 1; } }

        .a-valor-panel { max-width: 860px; margin: 10px auto 0; background: #fff; border-radius: 18px; padding: 16px; box-shadow: 0 10px 28px rgba(0,0,0,0.12); text-align: left; color: var(--text); }
        .a-valor-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
        .a-lbl { font-size: 11.5px; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
        .a-num { padding: 11px 13px; border-radius: 12px; border: 1px solid var(--border-soft); background: var(--bg-input); color: var(--text); font-size: 14px; outline: none; width: 100%; }
        .a-num:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); }
        .a-chip { padding: 8px 16px; border-radius: 999px; border: 1px solid var(--border-soft); background: #fff; color: var(--text-soft); cursor: pointer; font-size: 12.5px; font-weight: 500; transition: all .2s; }
        .a-chip:hover { border-color: var(--primary-border); color: var(--primary); }
        .a-chip.on { background: var(--primary); color: #fff; border-color: var(--primary); }

        .a-tipos { max-width: 1024px; margin: 40px auto 0; padding: 0 22px; }
        .a-tipos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(116px, 1fr)); gap: 12px; }
        .a-tipo { background: #fff; border: 1px solid var(--border); border-radius: 16px; padding: 18px 10px 14px; text-align: center; cursor: pointer; transition: transform .25s, box-shadow .25s, border-color .25s; box-shadow: 0 2px 10px rgba(0,0,0,0.03); }
        .a-tipo:hover { transform: translateY(-4px); box-shadow: 0 12px 26px rgba(0,0,0,0.09); border-color: var(--primary-border); }
        .a-tipo.on { border-color: var(--primary); box-shadow: 0 8px 22px rgba(192,57,43,0.18); }
        .a-tipo-emoji { font-size: 30px; line-height: 1; margin-bottom: 10px; }
        .a-tipo-nome { font-size: 13px; font-weight: 600; line-height: 1.25; }

        .a-section { max-width: 1024px; margin: 0 auto; padding: 56px 22px 0; }
        .a-sortbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 24px; }
        .a-count { font-size: 14px; color: var(--text-muted); margin: 0; }
        .a-count b { color: var(--text); font-weight: 600; }
        .a-sort { padding: 10px 18px; border-radius: 999px; border: 1px solid var(--border); font-size: 14px; background: #fff; color: var(--text); cursor: pointer; font-family: inherit; }
        .a-clear { margin-bottom: 24px; padding: 8px 16px; border-radius: 999px; border: 1px solid var(--border-soft); background: var(--bg-muted); color: var(--text-soft); cursor: pointer; font-size: 13px; font-weight: 500; }

        .a-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; }

        .p-card { background: #fff; border-radius: 20px; overflow: hidden; border: 1px solid var(--border); transition: transform .3s cubic-bezier(.2,.8,.2,1), box-shadow .3s; }
        .p-card:hover { transform: translateY(-6px); box-shadow: 0 18px 40px rgba(0,0,0,0.1); }
        .p-card-img { position: relative; height: 230px; overflow: hidden; background: var(--bg-muted); cursor: pointer; }
        .p-card-img img { width: 100%; height: 100%; object-fit: cover; transition: transform .5s; }
        .p-card:hover .p-card-img img { transform: scale(1.05); }
        .p-tag { position: absolute; top: 14px; left: 14px; background: rgba(255,255,255,0.92); backdrop-filter: blur(8px); color: var(--primary-dark); font-size: 11px; font-weight: 600; padding: 5px 12px; border-radius: 980px; }
        .p-card-body { padding: 20px 22px 22px; }
        .p-card-loc { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; cursor: pointer; }
        .p-card-title { font-size: 18px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.3; margin-bottom: 14px; min-height: 47px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; cursor: pointer; }
        .p-card-specs { display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; min-height: 20px; cursor: pointer; }
        .p-spec { font-size: 13px; color: var(--text-soft); display: inline-flex; align-items: center; gap: 5px; }
        .p-card-price { font-size: 22px; font-weight: 600; color: var(--text); letter-spacing: -0.02em; padding-top: 14px; border-top: 1px solid var(--border); cursor: pointer; }
        .p-card-price small { font-size: 13px; font-weight: 400; color: var(--text-muted); }
        .p-card-actions { margin-top: 16px; display: flex; gap: 8px; }
        .p-wa-btn { flex: 1; padding: 11px 0; font-size: 13.5px; border-radius: 12px; border: none; background: linear-gradient(135deg, #25D366 0%, #128C7E 100%); color: #fff; cursor: pointer; font-weight: 700; text-align: center; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 5px; }
        .p-share-btn { width: 100%; padding: 11px 0; font-size: 13.5px; border-radius: 12px; border: none; background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: #fff; cursor: pointer; font-weight: 700; }
        .p-popup { position: absolute; bottom: calc(100% + 6px); right: 0; z-index: 20; background: #fff; border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 14px 36px rgba(0,0,0,0.18); padding: 6px; min-width: 210px; }
        .p-popup-item { display: block; padding: 10px 14px; font-size: 13.5px; color: var(--text); text-decoration: none; border-radius: 10px; cursor: pointer; }
        .p-popup-item:hover { background: var(--bg-muted); }

        .a-banner { background: var(--bg-section); text-align: center; padding: 72px 22px; margin-top: 72px; }
        .a-banner h2 { font-size: clamp(26px, 4vw, 36px); font-weight: 600; letter-spacing: -0.02em; margin: 0 0 12px; }
        .a-banner p { color: var(--text-soft); font-size: 17px; max-width: 520px; margin: 0 auto 26px; }
        .a-banner a { display: inline-block; background: var(--primary); color: #fff; padding: 14px 34px; border-radius: 980px; font-size: 15px; font-weight: 500; text-decoration: none; }
        .a-banner a:hover { background: var(--primary-dark); }

        .a-footer { background: #fff; border-top: 1px solid var(--border); padding: 48px 22px 36px; }
        .a-footer-inner { max-width: 1024px; margin: 0 auto; }
        .a-footer-cols { display: flex; flex-wrap: wrap; gap: 20px 56px; justify-content: center; margin-bottom: 28px; text-align: center; }
        .a-footer-cols h4 { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 8px; }
        .a-footer-cols a, .a-footer-cols p { display: block; font-size: 13px; color: var(--text-soft); text-decoration: none; margin: 0 0 5px; line-height: 1.5; }
        .a-footer-cols a:hover { color: var(--primary); }
        .a-footer-legal { border-top: 1px solid var(--border); padding-top: 22px; display: flex; justify-content: center; align-items: center; gap: 14px; flex-wrap: wrap; text-align: center; }
        .a-creci { font-size: 13px; font-weight: 600; color: var(--primary-dark); background: #fff; border: 1px solid var(--primary-border); padding: 6px 14px; border-radius: 8px; }
        .a-footer-legal p { font-size: 11px; color: var(--text-muted); margin: 0; }

        .reveal { opacity: 0; transform: translateY(40px); transition: opacity .7s cubic-bezier(.22,.61,.36,1), transform .7s cubic-bezier(.22,.61,.36,1); }
        .reveal.on { opacity: 1; transform: translateY(0); }
        @media (prefers-reduced-motion: reduce) { .reveal { opacity: 1; transform: none; transition: none; } }

        .wa-float { position: fixed; bottom: 24px; right: 24px; z-index: 200; display: flex; align-items: center; gap: 9px; background: #25D366; color: #fff; border-radius: 999px; padding: 13px 22px 13px 18px; box-shadow: 0 6px 22px rgba(37,211,102,0.45); text-decoration: none; transition: transform .2s, box-shadow .2s; white-space: nowrap; }
        .wa-float:hover { transform: scale(1.04); box-shadow: 0 8px 28px rgba(37,211,102,0.55); }
        @media (max-width: 540px) { .wa-float { bottom: 18px; right: 18px; padding: 13px 18px; } .wa-float .wa-txt { display: none; } }
      `}</style>

      {/* NAV */}
      <nav className="a-nav">
        <div className="a-nav-inner">
          <div className="a-logo">
            <img src={LOGO_URL} alt="Inerente Gestão Imobiliária" />
            <b>Inerente</b> <em>Gestão Imobiliária</em>
          </div>
          <div className="a-nav-spacer"></div>
          <a href="/admin" className="a-nav-cta">Área do Corretor</a>
        </div>
      </nav>

      {/* HERO */}
      <section className="a-hero">
        <div className="a-tabs">
          {MODOS.map(m => (
            <button key={m.key} className={"a-tab " + (transacao === m.key ? "on" : "")}
              onClick={() => { setTransacao(m.key); setTipo("Todos"); setValorMin(""); setValorMax(""); }}>
              <span>{m.icon}</span>{m.label}
            </button>
          ))}
        </div>

        <div className="a-search">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Bairro, cidade ou palavra-chave" />
          <select value={tipo} onChange={e => setTipo(e.target.value)}>
            <option value="Todos">Tipo de imóvel</option>
            {tiposVisiveis.map(t => <option key={t.nome} value={t.nome}>{t.nome}</option>)}
          </select>
          <button className={"a-valor " + (filtroAberto ? "on" : "")} onClick={() => setFiltroAberto(o => !o)}>💰 Valor</button>
          <button className="a-go" onClick={() => document.getElementById("lista")?.scrollIntoView({ behavior: "smooth" })}>🔍</button>
        </div>

        {filtroAberto && (
          <div className="a-valor-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Faixa de preço{sufixoFaixa ? " (mensal)" : ""}</span>
              {(valorMin || valorMax) && <button onClick={() => { setValorMin(""); setValorMax(""); }} style={{ background: "transparent", border: "none", color: "var(--primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>✕ limpar</button>}
            </div>
            <div className="a-valor-grid">
              <div><span className="a-lbl">Mínimo (R$)</span><input className="a-num" type="number" inputMode="numeric" placeholder="0" value={valorMin} onChange={e => setValorMin(e.target.value)} /></div>
              <div><span className="a-lbl">Máximo (R$)</span><input className="a-num" type="number" inputMode="numeric" placeholder="sem limite" value={valorMax} onChange={e => setValorMax(e.target.value)} /></div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {faixas.map(v => {
                const on = v === 0 ? (!valorMax) : (String(v) === valorMax);
                return <button key={v} className={"a-chip " + (on ? "on" : "")} onClick={() => { setValorMin(""); setValorMax(v === 0 ? "" : String(v)); }}>{v === 0 ? "Qualquer" : `até R$ ${FAIXAS_FMT(v)}${sufixoFaixa}`}</button>;
              })}
            </div>
          </div>
        )}
      </section>

      {/* TIPOS */}
      {tiposVisiveis.length > 0 && (
        <div className="a-tipos">
          <div className="a-tipos-grid">
            {tiposVisiveis.map(t => {
              const ativo = tipo === t.nome;
              return (
                <button key={t.nome} className={"a-tipo " + (ativo ? "on" : "")} onClick={() => setTipo(ativo ? "Todos" : t.nome)}>
                  <div className="a-tipo-emoji">{emojiTipo(t.nome)}</div>
                  <div className="a-tipo-nome" style={ativo ? { color: "var(--primary)" } : null}>{t.nome}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* LISTA */}
      <div className="a-section" id="lista">
        <div className="a-sortbar">
          <p className="a-count">
            <b>{filtered.length}</b> {filtered.length === 1 ? "imóvel encontrado" : "imóveis encontrados"}
            {transacao !== "Todos" ? ` · ${transacao === "Venda" ? "Comprar" : "Alugar"}` : ""}
            {tipo !== "Todos" ? ` · ${tipo}` : ""}
          </p>
          <select className="a-sort" value={ordem} onChange={e => setOrdem(e.target.value)}>
            {ORDENACOES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>

        {(tipo !== "Todos" || transacao !== "Todos" || search || valorMin || valorMax) && (
          <button className="a-clear" onClick={() => { setTipo("Todos"); setTransacao("Todos"); setSearch(""); setValorMin(""); setValorMax(""); }}>✕ Limpar filtros</button>
        )}

        {loading && <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "4rem 0" }}>Carregando...</div>}
        {!loading && filtered.length === 0 && <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "4rem 0" }}>Nenhum imóvel encontrado com esses filtros.</div>}

        <div className="a-grid">
          {filtered.map((im, i) => (
            <div key={im.id} className="reveal" style={{ transitionDelay: `${Math.min((i % 6) * 70, 350)}ms` }}>
              <CardImovel im={im} onClick={() => navigate(`/imovel/${im.id}`)}
                onShare={() => setShareOpenId(shareOpenId === im.id ? null : im.id)}
                shareOpen={shareOpenId === im.id}
                onCopiar={() => copiarDescricao(im)}
                copiado={copiadoId === im.id} />
            </div>
          ))}
        </div>
      </div>

      {/* BANNER */}
      <div className="a-banner">
        <h2>Quer anunciar seu imóvel?</h2>
        <p>A Inerente cuida de tudo: fotos, anúncios nos portais, divulgação e negociação.</p>
        <a href={`https://wa.me/${EMPRESA.whatsapp}?text=${encodeURIComponent("Olá! Quero anunciar meu imóvel com a Inerente.")}`} target="_blank" rel="noreferrer">Falar com um corretor</a>
      </div>

      {/* RODAPÉ */}
      <footer className="a-footer">
        <div className="a-footer-inner">
          <div className="a-footer-cols">
            <div>
              <h4>Contato</h4>
              {EMPRESA.telefone && <a href={`https://wa.me/${EMPRESA.whatsapp}`} target="_blank" rel="noreferrer">{EMPRESA.telefone} · WhatsApp</a>}
              {EMPRESA.email && <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a>}
              {EMPRESA.instagram && <a href={`https://instagram.com/${EMPRESA.instagram.replace("@", "")}`} target="_blank" rel="noreferrer">{EMPRESA.instagram}</a>}
            </div>
            {EMPRESA.endereco && (
              <div>
                <h4>Endereço</h4>
                <p>📍 {EMPRESA.endereco}</p>
              </div>
            )}
          </div>
          <div className="a-footer-legal">
            {EMPRESA.creci && <span className="a-creci">{EMPRESA.creci}</span>}
            <p>© {new Date().getFullYear()} {EMPRESA.nome}</p>
          </div>
        </div>
      </footer>

      {/* WHATSAPP FLUTUANTE */}
      <a href={`https://wa.me/${EMPRESA.whatsapp}?text=${encodeURIComponent("Olá! Vi um imóvel no site e gostaria de mais informações.")}`} target="_blank" rel="noreferrer" className="wa-float" aria-label="Falar no WhatsApp">
        <span style={{ fontSize: 22, lineHeight: 1 }}>💬</span>
        <span className="wa-txt" style={{ fontSize: 14, fontWeight: 600 }}>Fale conosco no WhatsApp</span>
      </a>
    </div>
  );
}
