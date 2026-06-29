import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useImoveis } from "../shared/hooks";
import { RODAPE, EMPRESA, LOGO_URL } from "../constants";
import {
  formatBRL, isLote, isLocacao, isVenda, statusDoImovel, apareceNoSite, temRodape, descricaoPronta, linkLocalizacao
} from "../shared/utils";
import Lightbox from "../shared/Lightbox";

// chave do localStorage onde guardamos os IDs salvos pelo visitante (favoritos)
const FAV_KEY = "inerente_favoritos";

function lerFavoritos() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); } catch { return []; }
}
function gravarFavoritos(lista) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(lista)); } catch {}
}

// Normaliza um texto para comparar código (sem acento, minúsculo, espaços colapsados).
function normCod(s) {
  return (s || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function CompartilharPopup({ im, onCopiarTexto, copiado, onClose }) {
  const link = window.location.href;
  const titulo = im.titulo || "Imóvel";
  const wa = `https://wa.me/?text=${encodeURIComponent(`${titulo}\n${link}`)}`;
  const mail = `mailto:?subject=${encodeURIComponent(titulo)}&body=${encodeURIComponent(`${titulo}\n${link}`)}`;
  const copiarLink = async () => { try { await navigator.clipboard.writeText(link); } catch {} onClose(); };
  // Link de localização (pino + satélite), sempre a partir da coordenada atual.
  const mapsLink = linkLocalizacao(im);
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 90 }} />
      <div style={{
        position: "absolute", bottom: "calc(100% + 6px)", right: 0, zIndex: 91,
        background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14,
        boxShadow: "0 14px 36px rgba(0,0,0,0.18)", padding: 6, minWidth: 220, color: "var(--text)"
      }}>
        <a href={wa} target="_blank" rel="noreferrer" onClick={onClose} style={popItem}>💬 WhatsApp</a>
        <a href={mail} onClick={onClose} style={popItem}>✉️ Email</a>
        {mapsLink && <a href={mapsLink} target="_blank" rel="noreferrer" onClick={onClose} style={popItem}>📍 Localização no mapa</a>}
        <button onClick={copiarLink} style={{ ...popItem, width: "100%", border: "none", background: "transparent", textAlign: "left" }}>🔗 Copiar link</button>
        <button onClick={onCopiarTexto} style={{ ...popItem, width: "100%", border: "none", background: "transparent", textAlign: "left" }}>
          {copiado ? "✓ Copiado!" : "📋 Copiar descrição"}
        </button>
      </div>
    </>
  );
}

export default function ImovelPublico() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { imoveis, loading } = useImoveis();
  // Acha o imóvel pelo id do Firebase OU pelo código.
  const alvo = (() => { try { return decodeURIComponent(id || ""); } catch { return id || ""; } })();
  const alvoNorm = normCod(alvo);
  const im = imoveis.find(i => i.id === id)
    || imoveis.find(i => i.id === alvo)
    || imoveis.find(i => normCod(i.codigo) && normCod(i.codigo) === alvoNorm);
  const [fotoIdx, setFotoIdx] = useState(0);
  const [lb, setLb] = useState(null);
  const [share, setShare] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [favoritos, setFavoritos] = useState(lerFavoritos);
  const [vizinhancas, setVizinhancas] = useState([]);
  const ehFavorito = im ? favoritos.includes(im.id) : false;
  const toggleFavorito = () => {
    if (!im) return;
    const nova = ehFavorito ? favoritos.filter(x => x !== im.id) : [...favoritos, im.id];
    setFavoritos(nova); gravarFavoritos(nova);
  };

  // Sugeridos: mesmo tipo nos bairros vizinhos (tabela vizinhanças do Railway).
  // Fallback: mesma cidade, mesmo tipo.
  const relacionados = useMemo(() => {
    if (!im) return [];
    const base = imoveis.filter(x => x.id !== im.id && statusDoImovel(x) === "Disponível" && apareceNoSite(x) && x.tipo === im.tipo);

    // Normaliza nome para busca (sem acento, minúsculo)
    const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    // Tenta encontrar os vizinhos do bairro do imóvel atual
    if (vizinhancas.length > 0 && im.bairro) {
      const bairroNorm = norm(im.bairro);
      const entrada = vizinhancas.find(v =>
        norm(v.nome) === bairroNorm ||
        (v.apelidos && String(v.apelidos).split(",").map(a => norm(a.trim())).includes(bairroNorm))
      );
      if (entrada && entrada.vizinhos) {
        // vizinhos é CSV de chaves; normaliza para comparar com nomes dos imóveis
        const chavesViz = String(entrada.vizinhos).split(",").map(s => norm(s.trim())).filter(Boolean);
        const noVizinho = base.filter(x => {
          const bn = norm(x.bairro);
          return bn === bairroNorm || chavesViz.some(cv => bn.includes(cv) || cv.includes(bn));
        });
        if (noVizinho.length >= 2) return noVizinho.slice(0, 6);
      }
    }

    // Fallback: mesma cidade, mesmo tipo
    return base.filter(x => x.cidade === im.cidade).slice(0, 6);
  }, [imoveis, im, vizinhancas]);

  // Carrega vizinhanças do backend para melhorar os imóveis relacionados
  useEffect(() => {
    fetch("https://agentes-de-whatsapp-production.up.railway.app/grupos/vizinhancas-publico")
      .then(r => r.json())
      .then(d => { if (d && d.ok) setVizinhancas(d.vizinhancas || []); })
      .catch(() => {});
  }, []);

  // SEO: atualiza o título da aba e a meta description.
  useEffect(() => {
    const tituloPadrao = "Inerente Gestão Imobiliária — Imóveis para venda e locação";
    if (im && im.titulo) {
      const partes = [im.titulo];
      if (im.bairro) partes.push(im.bairro);
      if (im.cidade) partes.push(im.cidade);
      document.title = partes.join(" - ") + " | Inerente Gestão Imobiliária";
      const desc = (im.descricao || im.titulo || "").replace(/\s+/g, " ").trim().slice(0, 160);
      let meta = document.querySelector('meta[name="description"]');
      if (!meta) { meta = document.createElement("meta"); meta.setAttribute("name", "description"); document.head.appendChild(meta); }
      meta.setAttribute("content", desc);
    }
    return () => { document.title = tituloPadrao; };
  }, [im]);

  if (loading) return <div style={{ maxWidth: 880, margin: "0 auto", textAlign: "center", padding: "4rem 1rem", color: "var(--text-muted)" }}>Carregando...</div>;

  if (!im && imoveis.length === 0) {
    return <div style={{ maxWidth: 880, margin: "0 auto", textAlign: "center", padding: "4rem 1rem", color: "var(--text-muted)" }}>Carregando...</div>;
  }

  if (!im || statusDoImovel(im) !== "Disponível" || !apareceNoSite(im)) {
    return (
      <div style={{ maxWidth: 880, margin: "0 auto", textAlign: "center", padding: "5rem 1.5rem" }}>
        <h2 style={{ color: "var(--text)", fontWeight: 600 }}>Imóvel não disponível</h2>
        <p style={{ color: "var(--text-muted)" }}>Este imóvel não está mais disponível ou foi removido.</p>
        <button onClick={() => navigate("/")} style={{ marginTop: 16, padding: "12px 28px", borderRadius: 980, fontWeight: 500, background: "var(--primary)", color: "#fff", border: "none", cursor: "pointer", fontSize: 15 }}>
          Ver outros imóveis
        </button>
      </div>
    );
  }

  const isLot = isLote(im);
  const isLoc = isLocacao(im);
  const isVen = isVenda(im);
  const mensagemWa = `Olá! Tenho interesse no imóvel: ${im.titulo}\n${window.location.href}`;
  const linkWa = `https://wa.me/${EMPRESA.whatsapp}?text=${encodeURIComponent(mensagemWa)}`;

  const copiarDescricao = async () => {
    try { await navigator.clipboard.writeText(descricaoPronta(im)); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch {
      const ta = document.createElement("textarea"); ta.value = descricaoPronta(im); document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch {}
      document.body.removeChild(ta);
    }
    setShare(false);
  };

  const row = (label, val) => val ? (
    <div style={{ display: "flex", gap: 8, marginBottom: 10, fontSize: 14.5, flexWrap: "wrap" }}>
      <span style={{ color: "var(--text-muted)", minWidth: 160 }}>{label}</span>
      <span style={{ color: "var(--text)", fontWeight: 600 }}>{val}</span>
    </div>
  ) : null;

  const section = (titulo, children) => (
    <div className="ip-card">
      <p className="ip-card-h">{titulo}</p>
      {children}
    </div>
  );

  const cond = parseFloat(im.valorCondominioMensal) || parseFloat(im.valorCondominio) || 0;
  const iptu = parseFloat(im.valorIPTU) || 0;
  const extrasPreco = [];
  if (cond > 0) extrasPreco.push(["Condomínio", formatBRL(cond) + "/mês"]);
  if (iptu > 0) extrasPreco.push(["IPTU", formatBRL(iptu) + (isVen ? "/mês" : "")]);

  const atributos = [];
  if (parseInt(im.quartos) > 0) atributos.push(["🛏", `${im.quartos} ${parseInt(im.quartos) > 1 ? "quartos" : "quarto"}`]);
  if (parseInt(im.suites) > 0) atributos.push(["🚿", `${im.suites} ${parseInt(im.suites) > 1 ? "suítes" : "suíte"}`]);
  if (parseInt(im.banheiros) > 0) atributos.push(["🛁", `${im.banheiros} banh.`]);
  if (parseInt(im.garagens) > 0) atributos.push(["🚗", `${im.garagens} ${parseInt(im.garagens) > 1 ? "vagas" : "vaga"}`]);
  const m2hero = parseFloat(im.metragem) || parseFloat(im.metragemTotal) || 0;
  if (m2hero > 0) atributos.push(["📐", `${m2hero.toLocaleString("pt-BR")} m²`]);

  return (
    <div className="apple-site">
      <style>{`
        .apple-site { min-height: 100vh; background: #fff; color: var(--text); -webkit-font-smoothing: antialiased; }
        .apple-site * { box-sizing: border-box; }
        .a-nav { position: sticky; top: 0; z-index: 100; background: rgba(255,255,255,0.82); backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px); border-bottom: 1px solid var(--border); }
        .a-nav-inner { max-width: 1024px; margin: 0 auto; height: 56px; padding: 0 22px; display: flex; align-items: center; gap: 14px; }
        .a-logo { display: flex; align-items: center; gap: 9px; cursor: pointer; }
        .a-logo img { height: 26px; width: auto; display: block; }
        .a-logo b { font-size: 18px; font-weight: 600; letter-spacing: -0.02em; color: var(--primary-dark); }
        .a-logo em { font-style: normal; font-weight: 400; font-size: 14px; color: var(--text-soft); }
        @media (max-width: 540px) { .a-logo em { display: none; } }
        .a-nav-spacer { flex: 1; }
        .a-nav-cta { font-size: 13px; font-weight: 500; background: var(--primary); color: #fff; padding: 7px 16px; border-radius: 980px; text-decoration: none; }
        .a-nav-cta:hover { background: var(--primary-dark); }

        .ip-wrap { max-width: 880px; margin: 0 auto; padding: 28px 22px 0; }
        .ip-back { display: inline-flex; align-items: center; gap: 6px; background: none; border: none; color: var(--primary); font-size: 14px; font-weight: 500; cursor: pointer; padding: 0; margin-bottom: 20px; }
        .ip-gallery { border-radius: 20px; overflow: hidden; background: var(--bg-muted); margin-bottom: 14px; }
        .ip-gallery-main { width: 100%; max-height: 520px; object-fit: contain; cursor: zoom-in; background: var(--bg-muted); display: block; }
        .ip-thumbs { display: flex; gap: 8px; margin-top: 10px; overflow-x: auto; padding-bottom: 4px; }
        .ip-thumb { width: 88px; height: 88px; object-fit: cover; border-radius: 12px; cursor: pointer; flex-shrink: 0; }

        .ip-head { margin-bottom: 18px; }
        .ip-tags { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
        .ip-tag { background: var(--primary-light); color: var(--primary-dark); font-size: 12px; font-weight: 600; padding: 5px 14px; border-radius: 980px; }
        .ip-title { font-size: clamp(24px, 4vw, 36px); font-weight: 600; letter-spacing: -0.02em; line-height: 1.1; margin: 0 0 8px; }
        .ip-loc { font-size: 14px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin: 0; }
        .ip-attrs { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
        .ip-attr { display: inline-flex; align-items: center; gap: 6px; background: var(--bg-muted); border: 1px solid var(--border); padding: 8px 16px; border-radius: 980px; font-size: 14px; color: var(--text-soft); font-weight: 500; }
        .ip-fav { display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--border); padding: 8px 16px; border-radius: 980px; font-size: 13px; font-weight: 600; cursor: pointer; background: #fff; color: var(--text-soft); }
        .ip-fav.on { background: var(--primary); color: #fff; border-color: var(--primary); }

        .ip-price { background: linear-gradient(135deg, var(--primary-light) 0%, #fff 100%); border: 1px solid var(--primary-border); border-radius: 20px; padding: 24px 26px; margin-bottom: 16px; }
        .ip-price-main { font-size: clamp(28px, 5vw, 38px); font-weight: 600; color: var(--primary-dark); letter-spacing: -0.02em; margin: 0; }
        .ip-price-main small { font-size: 14px; font-weight: 400; opacity: 0.7; margin-left: 8px; }
        .ip-price-extras { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-top: 16px; }
        .ip-price-extra { background: #fff; border-radius: 12px; padding: 11px 14px; border: 1px solid var(--border); }
        .ip-price-extra p:first-child { margin: 0; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
        .ip-price-extra p:last-child { margin: 4px 0 0; font-size: 16px; font-weight: 600; color: var(--text); }
        .ip-cod { text-align: center; font-size: 13px; font-weight: 600; color: var(--primary); letter-spacing: 0.5px; margin: 0 0 16px; }

        .ip-ctas { display: flex; flex-direction: column; gap: 10px; margin-bottom: 22px; }
        .ip-wa { background: linear-gradient(135deg, #25D366 0%, #128C7E 100%); color: #fff; text-align: center; padding: 16px 0; border-radius: 14px; font-weight: 600; font-size: 16px; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .ip-share-wrap { position: relative; }
        .ip-share { width: 100%; background: var(--primary); color: #fff; border: none; padding: 13px 0; border-radius: 14px; font-weight: 600; font-size: 15px; cursor: pointer; }
        .ip-share:hover { background: var(--primary-dark); }
        .ip-popup { position: absolute; bottom: calc(100% + 6px); right: 0; z-index: 91; background: #fff; border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 14px 36px rgba(0,0,0,0.18); padding: 6px; min-width: 220px; }
        .ip-popup a, .ip-popup button { display: block; width: 100%; text-align: left; padding: 10px 14px; font-size: 13.5px; color: var(--text); text-decoration: none; border-radius: 10px; cursor: pointer; border: none; background: transparent; }
        .ip-popup a:hover, .ip-popup button:hover { background: var(--bg-muted); }

        .ip-card { background: #fff; border: 1px solid var(--border); border-radius: 18px; padding: 22px 24px; margin-bottom: 16px; }
        .ip-card-h { margin: 0 0 16px; font-weight: 600; font-size: 12px; color: var(--primary); letter-spacing: 0.06em; text-transform: uppercase; }
        .ip-related-h { font-size: clamp(22px, 3vw, 28px); font-weight: 600; letter-spacing: -0.02em; margin: 32px 0 6px; }

        .ip-rel-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr)); gap: 16px; margin-top: 16px; }
        .ip-rel-card { background: #fff; border: 1px solid var(--border); border-radius: 18px; overflow: hidden; cursor: pointer; transition: transform .3s, box-shadow .3s; }
        .ip-rel-card:hover { transform: translateY(-5px); box-shadow: 0 14px 32px rgba(0,0,0,0.1); }
        .ip-rel-img { height: 170px; background: var(--bg-muted); overflow: hidden; }
        .ip-rel-img img { width: 100%; height: 100%; object-fit: cover; }
        .ip-rel-body { padding: 14px 16px; }
        .ip-rel-loc { font-size: 11px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; }
        .ip-rel-title { font-size: 15px; font-weight: 600; line-height: 1.3; margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .ip-rel-price { font-size: 17px; font-weight: 600; color: var(--primary); }

        .wa-float { position: fixed; bottom: 24px; right: 24px; z-index: 200; display: flex; align-items: center; gap: 9px; background: #25D366; color: #fff; border-radius: 999px; padding: 13px 22px 13px 18px; box-shadow: 0 6px 22px rgba(37,211,102,0.45); text-decoration: none; transition: transform .2s; white-space: nowrap; }
        .wa-float:hover { transform: scale(1.04); }
        @media (max-width: 540px) { .wa-float { bottom: 18px; right: 18px; padding: 13px 18px; } .wa-float .wa-txt { display: none; } }
      `}</style>

      <nav className="a-nav">
        <div className="a-nav-inner">
          <div className="a-logo" onClick={() => navigate("/")}>
            <img src={LOGO_URL} alt="Inerente" />
            <b>Inerente</b> <em>Gestão Imobiliária</em>
          </div>
          <div className="a-nav-spacer"></div>
          <a href="/admin" className="a-nav-cta">Área do Corretor</a>
        </div>
      </nav>

      <Lightbox idx={lb} fotos={im.fotos || []} onClose={() => setLb(null)} onChange={setLb} />

      <div className="ip-wrap">
        <button className="ip-back" onClick={() => navigate("/")}>← Voltar para a busca</button>

        {/* Galeria */}
        {im.fotos?.length > 0 && (
          <div>
            <div className="ip-gallery">
              <img className="ip-gallery-main" src={im.fotos[fotoIdx]} alt="" onClick={() => setLb(fotoIdx)} />
            </div>
            {im.fotos.length > 1 && (
              <div className="ip-thumbs">
                {im.fotos.map((f, i) => (
                  <img key={i} className="ip-thumb" src={f} alt="" onClick={() => setFotoIdx(i)}
                    style={{ border: i === fotoIdx ? "2px solid var(--primary)" : "1px solid var(--border-soft)" }} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Título + atributos */}
        <div className="ip-head">
          <div className="ip-tags">
            {im.tipo && <span className="ip-tag">{im.tipo}</span>}
            {im.transacao && <span className="ip-tag">{im.transacao}</span>}
            {im.condominio && <span className="ip-tag">Em condomínio</span>}
          </div>
          <h1 className="ip-title">{im.titulo}</h1>
          {(im.bairro || im.cidade) && <p className="ip-loc">{[im.bairro, im.cidade].filter(Boolean).join(", ")}</p>}
          <div className="ip-attrs">
            <button className={"ip-fav " + (ehFavorito ? "on" : "")} onClick={toggleFavorito}>{ehFavorito ? "♥ Salvo" : "♡ Salvar"}</button>
            {atributos.map(([ic, t]) => <span key={t} className="ip-attr">{ic} {t}</span>)}
            {isLot && im.asfalto && <span className="ip-attr">📍 Asfalto</span>}
            {isLot && im.agua && <span className="ip-attr">💧 Água</span>}
            {isLot && im.esgoto && <span className="ip-attr">◎ Esgoto</span>}
          </div>
        </div>

        {/* Preço */}
        <div className="ip-price">
          {isVen && im.preco && <p className="ip-price-main">{formatBRL(im.preco)}<small>à venda</small></p>}
          {isLoc && parseFloat(im.valorAluguel) > 0 && (
            <p className="ip-price-main" style={isVen ? { fontSize: 24, marginTop: 10 } : null}>{formatBRL(im.valorAluguel)}<small>/mês</small></p>
          )}
          {extrasPreco.length > 0 && (
            <div className="ip-price-extras">
              {extrasPreco.map(([k, v]) => (
                <div key={k} className="ip-price-extra"><p>{k}</p><p>{v}</p></div>
              ))}
            </div>
          )}
        </div>

        {im.codigo && <p className="ip-cod">CÓD: {String(im.codigo).toUpperCase()}</p>}

        {/* CTAs */}
        <div className="ip-ctas">
          <a href={linkWa} target="_blank" rel="noreferrer" className="ip-wa">💬 Tenho interesse — falar no WhatsApp</a>
          <div className="ip-share-wrap">
            <button className="ip-share" onClick={() => setShare(s => !s)}>↗ Compartilhar</button>
            {share && <CompartilharPopup im={im} onCopiarTexto={copiarDescricao} copiado={copiado} onClose={() => setShare(false)} />}
          </div>
        </div>

        {/* Valor extra (Ágio, Preço/m²) */}
        {(() => {
          const m2 = parseFloat(im.metragem) || parseFloat(im.metragemTotal) || 0;
          const preco = parseFloat(im.preco) || 0;
          const precoM2 = (m2 > 0 && preco > 0) ? Math.round(preco / m2) : 0;
          const agio = parseFloat(im.valorAgio) || 0;
          const linhas = [];
          if (agio > 0) linhas.push(["Ágio", formatBRL(agio)]);
          if (precoM2 > 0) linhas.push(["Preço por m²", formatBRL(precoM2)]);
          if (!linhas.length) return null;
          return section("Valor do imóvel", (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              {linhas.map(([k, v]) => (
                <div key={k} style={{ background: "var(--bg-muted)", borderRadius: 12, padding: "12px 14px", border: "1px solid var(--border)" }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>{k}</p>
                  <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 600, color: "var(--text)" }}>{v}</p>
                </div>
              ))}
            </div>
          ));
        })()}

        {section("Características", <>
          {im.estadoImovel && row("Estado", im.estadoImovel)}
          {im.metragem && row("Metragem construída", im.metragem + " m²")}
          {im.metragemTotal && row("Metragem do terreno", im.metragemTotal + " m²")}
          {!isLot && parseInt(im.quartos) > 0 && row("Quartos", im.quartos)}
          {!isLot && parseInt(im.suites) > 0 && row("Suítes", im.suites)}
          {!isLot && parseInt(im.banheiros) > 0 && row("Banheiros", im.banheiros)}
          {parseInt(im.garagens) > 0 && row("Garagens", im.garagens)}
          {isLot && <>
            {row("Asfalto", im.asfalto ? "Sim" : null)}
            {row("Água", im.agua ? "Sim" : null)}
            {row("Esgoto", im.esgoto ? "Sim" : null)}
            {row("Murado", im.muro ? "Sim" : null)}
            {row("Esquina", im.esquina ? "Sim" : null)}
            {row("Declive", im.declive)}
            {im.retangular && im.frente && im.laterais ? row("Medidas", `${im.frente} x ${im.laterais} m`) : row("Medidas", im.medidas)}
          </>}
          {im.condominio && im.nomeCondominio && row("Condomínio", im.nomeCondominio)}
        </>)}

        {im.condicoes?.length > 0 && section("Condições comerciais", (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {im.condicoes.map(c => (
              <span key={c} style={{ background: "var(--primary-light)", color: "var(--primary-dark)", padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600 }}>
                {c}{c === "Permuta" && im.permuta ? `: ${im.permuta}` : ""}
              </span>
            ))}
          </div>
        ))}

        {im.descricao && section("Descrição", (
          <p style={{ fontSize: 15, color: "var(--text-soft)", lineHeight: 1.75, margin: 0, whiteSpace: "pre-wrap" }}>{im.descricao}</p>
        ))}

        {(im.mapsLink || (im.latitude && im.longitude)) && (() => {
          const consulta = (im.latitude && im.longitude)
            ? `${im.latitude},${im.longitude}`
            : [im.endereco, im.bairro, im.cidade, im.estado].filter(Boolean).join(", ");
          const embedSrc = `https://www.google.com/maps?q=${encodeURIComponent(consulta)}&z=17&t=k&output=embed`;
          const linkMapa = linkLocalizacao(im);
          return section("Localização", (
            <div>
              {(im.endereco || im.bairro || im.cidade) && (
                <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--text)", fontWeight: 600 }}>
                  📍 {[
                    im.endereco ? im.endereco.replace(/,?\s*(n[°º.:]?\s*\d+[\w-]*|qd?\.?\s*\d+|lt?\.?\s*\d+|quadra\s*\d+|lote\s*\d+)/gi, "").trim().replace(/,\s*$/, "").trim() : null,
                    im.bairro, im.cidade, im.estado
                  ].filter(Boolean).join(", ")}
                </p>
              )}
              <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)" }}>
                <iframe src={embedSrc} title="Mapa" loading="lazy"
                  style={{ width: "100%", height: "min(320px, 56vw)", border: 0, display: "block" }}
                  referrerPolicy="no-referrer-when-downgrade" />
              </div>
              {linkMapa && (
                <a href={linkMapa} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, padding: "9px 16px", color: "var(--primary)", border: "1px solid var(--primary)", borderRadius: 12, fontSize: 13.5, textDecoration: "none", fontWeight: 600 }}>↗ Abrir no Google Maps</a>
              )}
            </div>
          ));
        })()}

        {!temRodape(im.descricao) && <p style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic", margin: "20px 0", textAlign: "center" }}>{RODAPE}</p>}

        {/* Relacionados */}
        {relacionados.length > 0 && (
          <div style={{ margin: "8px 0 16px" }}>
            <h2 className="ip-related-h">Imóveis relacionados</h2>
            <p style={{ margin: "0", fontSize: 14, color: "var(--text-muted)" }}>Outras opções que podem te interessar</p>
            <div className="ip-rel-grid">
              {relacionados.map(r => {
                const rf = r.fotos?.[0];
                const rLoc = [r.bairro, r.cidade].filter(Boolean).join(", ");
                const rPreco = r.transacao === "Locação" ? (r.valorFinal || r.valorAluguel) : r.preco;
                return (
                  <div key={r.id} className="ip-rel-card" onClick={() => navigate(`/imovel/${r.id}`)}>
                    <div className="ip-rel-img">{rf ? <img src={rf} alt="" loading="lazy" /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, opacity: 0.4 }}>🏠</div>}</div>
                    <div className="ip-rel-body">
                      <div className="ip-rel-loc">{rLoc}</div>
                      <div className="ip-rel-title">{r.titulo || r.tipo || "Imóvel"}</div>
                      {rPreco && <div className="ip-rel-price">R$ {parseFloat(rPreco).toLocaleString("pt-BR")}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <a href={linkWa} target="_blank" rel="noreferrer" className="ip-wa" style={{ marginTop: 8, marginBottom: 40 }}>
          💬 Falar com a {EMPRESA.nome} no WhatsApp
        </a>
      </div>

      {/* WHATSAPP FLUTUANTE */}
      <a href={linkWa} target="_blank" rel="noreferrer" className="wa-float" aria-label="Falar no WhatsApp">
        <span style={{ fontSize: 22, lineHeight: 1 }}>💬</span>
        <span className="wa-txt" style={{ fontSize: 14, fontWeight: 600 }}>Fale conosco no WhatsApp</span>
      </a>
    </div>
  );
}

const popItem = { display: "block", padding: "10px 14px", fontSize: 13.5, color: "var(--text)", textDecoration: "none", borderRadius: 10, cursor: "pointer" };
