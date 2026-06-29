import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useImoveis } from "../shared/hooks";
import { RODAPE, EMPRESA, LOGO_URL } from "../constants";
import {
  formatBRL, isLote, isLocacao, isVenda, statusDoImovel, apareceNoSite, temRodape, descricaoPronta, linkLocalizacao
} from "../shared/utils";
import { pageWrap } from "../shared/styles";
import Lightbox from "../shared/Lightbox";
import ImovelCard from "../shared/ImovelCard";


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

  if (loading) return <div style={{ ...pageWrap(), textAlign: "center", padding: "4rem 1rem", color: "var(--text-muted)" }}>Carregando...</div>;

  if (!im && imoveis.length === 0) {
    return <div style={{ ...pageWrap(), textAlign: "center", padding: "4rem 1rem", color: "var(--text-muted)" }}>Carregando...</div>;
  }

  if (!im || statusDoImovel(im) !== "Disponível" || !apareceNoSite(im)) {
    return (
      <div style={{ minHeight: "100vh", background: "#fff" }}>
        <div style={{ borderBottom: "1px solid var(--border)", padding: "0 22px", height: 56, display: "flex", alignItems: "center", maxWidth: 1024, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }} onClick={() => navigate("/")}>
            <img src={LOGO_URL} alt="Inerente" style={{ height: 26 }} />
            <b style={{ fontSize: 18, fontWeight: 600, color: "var(--primary-dark)" }}>Inerente</b>
          </div>
        </div>
        <div style={{ maxWidth: 880, margin: "0 auto", textAlign: "center", padding: "5rem 1.5rem" }}>
          <h2 style={{ color: "var(--text)", fontWeight: 600 }}>Imóvel não disponível</h2>
          <p style={{ color: "var(--text-muted)" }}>Este imóvel não está mais disponível ou foi removido.</p>
          <button onClick={() => navigate("/")} style={{ marginTop: 16, padding: "12px 28px", borderRadius: 980, fontWeight: 500, background: "var(--primary)", color: "#fff", border: "none", cursor: "pointer", fontSize: 15 }}>
            Ver outros imóveis
          </button>
        </div>
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
    <div style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: 14, flexWrap: "wrap" }}>
      <span style={{ color: "var(--text-muted)", minWidth: 150 }}>{label}</span>
      <span style={{ color: "var(--text)", fontWeight: 600 }}>{val}</span>
    </div>
  ) : null;

  const section = (titulo, children) => (
    <div className="card-apple" style={{ padding: "1.4rem 1.6rem", marginBottom: "1rem" }}>
      <p style={{ margin: "0 0 14px", fontWeight: 800, fontSize: 12.5, color: "var(--primary)", letterSpacing: 0.6, textTransform: "uppercase" }}>{titulo}</p>
      {children}
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      <nav className="ip-apple-nav">
        <div className="ip-apple-nav-inner">
          <div className="ip-apple-logo" onClick={() => navigate("/")}>
            <img src={LOGO_URL} alt="Inerente" />
            <b>Inerente</b> <em>Gestão Imobiliária</em>
          </div>
          <a href="/admin" className="ip-apple-cta">Área do Corretor</a>
        </div>
      </nav>
      <style>{`
        .ip-apple-nav { position: sticky; top: 0; z-index: 100; background: rgba(255,255,255,0.82); backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px); border-bottom: 1px solid var(--border); }
        .ip-apple-nav-inner { max-width: 1024px; margin: 0 auto; height: 56px; padding: 0 22px; display: flex; align-items: center; gap: 14px; }
        .ip-apple-logo { display: flex; align-items: center; gap: 9px; cursor: pointer; }
        .ip-apple-logo img { height: 26px; display: block; }
        .ip-apple-logo b { font-size: 18px; font-weight: 600; color: var(--primary-dark); }
        .ip-apple-logo em { font-style: normal; font-weight: 400; font-size: 14px; color: var(--text-soft); }
        @media (max-width: 540px) { .ip-apple-logo em { display: none; } }
        .ip-apple-cta { margin-left: auto; font-size: 13px; font-weight: 500; background: var(--primary); color: #fff; padding: 7px 16px; border-radius: 980px; text-decoration: none; }
        .card-apple { background: var(--bg-card); border: 1px solid var(--border); border-radius: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.04); }
      `}</style>
      <Lightbox idx={lb} fotos={im.fotos || []} onClose={() => setLb(null)} onChange={setLb} />

      {/* HERO */}
      <div style={{
        position: "relative",
        background: "radial-gradient(120% 130% at 50% -12%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 42%), linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)",
        color: "#fff", padding: "1rem clamp(0.8rem, 4vw, 1.5rem) 2rem", borderRadius: "0 0 30px 30px"
      }}>
        <div style={{ maxWidth: 880, margin: "0 auto", textAlign: "center" }}>
          <button onClick={() => navigate("/")} style={{
            display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)",
            border: "1px solid rgba(255,255,255,0.28)", color: "#fff", fontSize: 13, fontWeight: 600,
            padding: "7px 14px", borderRadius: 999, cursor: "pointer", backdropFilter: "blur(6px)"
          }}>← Voltar</button>

          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap", justifyContent: "center" }}>
            {im.tipo && <span style={chipHero}>{im.tipo}</span>}
            {im.transacao && <span style={chipHero}>{im.transacao}</span>}
            {im.condominio && <span style={chipHero}>Em condomínio</span>}
          </div>

          <h1 className="display" style={{ margin: "10px 0 4px", fontSize: "clamp(22px, 5.5vw, 38px)", fontWeight: 800, lineHeight: 1.1 }}>{im.titulo}</h1>
          {(im.bairro || im.cidade) && (
            <p style={{ margin: 0, fontSize: 14, opacity: 0.92, fontWeight: 600, letterSpacing: 0.2 }}>
              {[im.bairro, im.cidade].filter(Boolean).join(", ").toUpperCase()}
            </p>
          )}

          {/* atalhos rápidos: salvar + atributos principais */}
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}>
            <button onClick={toggleFavorito}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                background: ehFavorito ? "#fff" : "rgba(255,255,255,0.16)",
                color: ehFavorito ? "var(--primary-dark)" : "#fff",
                border: "1px solid " + (ehFavorito ? "#fff" : "rgba(255,255,255,0.32)"),
                padding: "8px 16px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer",
                backdropFilter: "blur(6px)"
              }}>
              {ehFavorito ? "♥ Salvo" : "♡ Salvar"}
            </button>
            {parseInt(im.quartos) > 0 && <span style={chipAttr}>🛏️ {im.quartos} qto{parseInt(im.quartos) > 1 ? "s" : ""}</span>}
            {parseInt(im.suites) > 0 && <span style={chipAttr}>🚿 {im.suites} suíte{parseInt(im.suites) > 1 ? "s" : ""}</span>}
            {parseInt(im.banheiros) > 0 && <span style={chipAttr}>🛁 {im.banheiros} banh.</span>}
            {parseInt(im.garagens) > 0 && <span style={chipAttr}>🚗 {im.garagens} vaga{parseInt(im.garagens) > 1 ? "s" : ""}</span>}
            {(parseFloat(im.metragem) || parseFloat(im.metragemTotal)) > 0 && (
              <span style={chipAttr}>📐 {(parseFloat(im.metragem) || parseFloat(im.metragemTotal)).toLocaleString("pt-BR")} m²</span>
            )}
            {im.asfalto && <span style={chipAttr}>≡ Asfalto</span>}
            {im.agua && <span style={chipAttr}>💧 Água</span>}
            {im.esgoto && <span style={chipAttr}>◎ Esgoto</span>}
          </div>
        </div>
      </div>

      {/* CONTEÚDO */}
      <div style={{ maxWidth: 880, margin: "-22px auto 0", padding: "0 clamp(0.6rem, 4vw, 1.25rem)", position: "relative", zIndex: 2 }}>
        {/* Galeria */}
        {im.fotos?.length > 0 ? (
          <div className="card-apple" style={{ padding: 10, marginBottom: "1rem" }}>
            <img src={im.fotos[fotoIdx]} alt="" onClick={() => setLb(fotoIdx)}
              style={{ width: "100%", maxHeight: 520, objectFit: "contain", borderRadius: 16, cursor: "zoom-in", background: "var(--bg-muted)" }} />
            {im.fotos.length > 1 && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
                {im.fotos.map((f, i) => (
                  <img key={i} src={f} onClick={() => setFotoIdx(i)} alt=""
                    style={{ width: 88, height: 88, objectFit: "cover", borderRadius: 12, cursor: "pointer", flexShrink: 0, border: i === fotoIdx ? "2px solid var(--primary)" : "1px solid var(--border-soft)" }} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="card-apple" style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60, marginBottom: "1rem" }}>🏠</div>
        )}

        {/* Preço destaque */}
        <div className="card-apple" style={{ padding: "1.4rem 1.6rem", marginBottom: "0.8rem", background: "linear-gradient(135deg, var(--primary-light) 0%, var(--bg-card) 70%)", border: "1px solid var(--primary-border)", borderRadius: 20 }}>
          {isVen && im.preco && (
            <p style={{ margin: 0, fontSize: 30, fontWeight: 800, color: "var(--primary-dark)", letterSpacing: -0.5 }}>
              {formatBRL(im.preco)}
              <span style={{ fontSize: 13.5, fontWeight: 500, marginLeft: 10, opacity: 0.75 }}>à venda</span>
            </p>
          )}
          {isLoc && parseFloat(im.valorAluguel) > 0 && (
            <p style={{ margin: isVen ? "10px 0 0" : 0, fontSize: 24, fontWeight: 800, color: "var(--primary-dark)" }}>
              {formatBRL(im.valorAluguel)}<span style={{ fontSize: 14, fontWeight: 500 }}>/mês</span>
              <span style={{ fontSize: 12.5, fontWeight: 500, marginLeft: 10, opacity: 0.75 }}>de aluguel</span>
            </p>
          )}
          {/* Condomínio e IPTU logo abaixo do preço */}
          {(() => {
            const cond = parseFloat(im.valorCondominioMensal) || parseFloat(im.valorCondominio) || 0;
            const iptu = parseFloat(im.valorIPTU) || 0;
            const extras = [];
            if (cond > 0) extras.push(["Condomínio", formatBRL(cond) + "/mês"]);
            if (iptu > 0) extras.push(["IPTU", formatBRL(iptu) + (isVen ? "/mês" : "")]);
            if (!extras.length) return null;
            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginTop: 14 }}>
                {extras.map(([k, v]) => (
                  <div key={k} style={{ background: "var(--bg-muted)", borderRadius: 12, padding: "10px 14px", border: "1px solid var(--border)" }}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>{k}</p>
                    <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 800, color: "var(--text)" }}>{v}</p>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* CÓD entre o preço e os botões */}
        {im.codigo && (
          <p style={{ margin: "0 0 0.9rem", textAlign: "center", fontSize: 13, fontWeight: 800, color: "var(--primary)", letterSpacing: 0.5 }}>
            CÓD: {String(im.codigo).toUpperCase()}
          </p>
        )}

        {/* CTAs: WhatsApp + Compartilhar */}
        <div style={{ display: "flex", gap: 10, marginBottom: "1.4rem", flexDirection: "column" }}>
          <a href={linkWa} target="_blank" rel="noreferrer" className="btn-wa" style={{
            textAlign: "center", padding: "16px 0",
            borderRadius: 14, fontWeight: 800, fontSize: 16,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8
          }}>
            💬 Tenho interesse — falar no WhatsApp
          </a>
          <div style={{ position: "relative" }}>
            <button onClick={() => setShare(s => !s)} className="btn-grad" style={{ width: "100%", padding: "13px 0", borderRadius: 14, fontWeight: 800, fontSize: 15 }}>
              ↗ Compartilhar
            </button>
            {share && <CompartilharPopup im={im} onCopiarTexto={copiarDescricao} copiado={copiado} onClose={() => setShare(false)} />}
          </div>
        </div>

        {(() => {
          // Bloco financeiro extra: só Ágio e Preço por m² (condomínio/IPTU já aparecem no destaque).
          const m2 = parseFloat(im.metragem) || parseFloat(im.metragemTotal) || 0;
          const preco = parseFloat(im.preco) || 0;
          const precoM2 = (isVen && preco > 0 && m2 > 0) ? preco / m2 : 0;
          const agio = parseFloat(im.valorAgio) || 0;
          const linhas = [];
          if (agio > 0) linhas.push(["Ágio", formatBRL(agio)]);
          if (precoM2 > 0) linhas.push(["Preço por m²", formatBRL(precoM2)]);
          if (!linhas.length) return null;
          return section("Valor do imóvel", (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              {linhas.map(([k, v]) => (
                <div key={k} style={{
                  background: "var(--bg-muted)", borderRadius: 12, padding: "12px 14px",
                  border: "1px solid var(--border)"
                }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>{k}</p>
                  <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 800, color: "var(--text)" }}>{v}</p>
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
            {im.retangular && im.frente && im.laterais
              ? row("Medidas", `${im.frente} x ${im.laterais} m`)
              : row("Medidas", im.medidas)}
          </>}
          {im.condominio && im.nomeCondominio && row("Condomínio", im.nomeCondominio)}
        </>)}

        {im.condicoes?.length > 0 && section("Condições comerciais", (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {im.condicoes.map(c => (
              <span key={c} style={{ background: "var(--primary-light)", color: "var(--primary-dark)", padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700 }}>
                {c}{c === "Permuta" && im.permuta ? `: ${im.permuta}` : ""}
              </span>
            ))}
          </div>
        ))}

        {im.descricao && section("Descrição", (
          <p style={{ fontSize: 14.5, color: "var(--text-soft)", lineHeight: 1.75, margin: 0, whiteSpace: "pre-wrap" }}>
            {im.descricao}
          </p>
        ))}

        {(im.mapsLink || (im.latitude && im.longitude)) && (() => {
          // Gera a URL embed do Google Maps. Se tiver lat/lng usa coordenadas (mais preciso),
          // senão usa o endereço/bairro/cidade. Sem chave do Google = usa o mode embed simples.
          const consulta = (im.latitude && im.longitude)
            ? `${im.latitude},${im.longitude}`
            : [im.endereco, im.bairro, im.cidade, im.estado].filter(Boolean).join(", ");
          // t=k força a camada de SATÉLITE (não Street View / mapa normal).
          const embedSrc = `https://www.google.com/maps?q=${encodeURIComponent(consulta)}&z=17&t=k&output=embed`;
          const linkMapa = linkLocalizacao(im); // link pino+satélite (escopo local do IIFE)
          return section("Localização", (
            <div>
              {(im.endereco || im.bairro || im.cidade) && (
                <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--text)", fontWeight: 600 }}>
                  📍 {[
                    // Endereço: só o nome da rua (remove número, QD, LT, Quadra, Lote)
                    im.endereco ? im.endereco.replace(/,?\s*(n[°º.:]?\s*\d+[\w-]*|qd?\.?\s*\d+|lt?\.?\s*\d+|quadra\s*\d+|lote\s*\d+)/gi, "").trim().replace(/,\s*$/, "").trim() : null,
                    im.bairro, im.cidade, im.estado
                  ].filter(Boolean).join(", ")}
                </p>
              )}
              <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)" }}>
                <iframe
                  src={embedSrc}
                  title="Mapa"
                  loading="lazy"
                  style={{ width: "100%", height: "min(320px, 56vw)", border: 0, display: "block" }}
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              {linkMapa && (
                <a href={linkMapa} target="_blank" rel="noreferrer" style={{
                  display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12,
                  padding: "9px 16px", color: "var(--primary)", border: "1px solid var(--primary)",
                  borderRadius: 12, fontSize: 13.5, textDecoration: "none", fontWeight: 700
                }}>↗ Abrir no Google Maps</a>
              )}
            </div>
          ));
        })()}



        {!temRodape(im.descricao) && <p style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic", marginTop: "1.5rem", textAlign: "center" }}>{RODAPE}</p>}

        {/* Imóveis relacionados */}
        {relacionados.length > 0 && (
          <div style={{ margin: "2rem 0 1rem" }}>
            <h2 className="display" style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 800, color: "var(--text)" }}>Imóveis relacionados</h2>
            <p style={{ margin: "0 0 16px", fontSize: 13.5, color: "var(--text-muted)" }}>Outras opções que podem te interessar</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))", gap: 16 }}>
              {relacionados.map(r => (
                <ImovelCard key={r.id} im={r} onClick={() => navigate(`/imovel/${r.id}`)} showStatus={false} />
              ))}
            </div>
          </div>
        )}

        <a href={linkWa} target="_blank" rel="noreferrer" className="btn-wa" style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "16px 12px", borderRadius: 14, fontWeight: 800, fontSize: 16,
          marginTop: "0.5rem", marginBottom: "2.5rem", textAlign: "center", lineHeight: 1.3,
          textDecoration: "none", width: "100%", boxSizing: "border-box", flexWrap: "wrap"
        }}>
          💬 Falar com a {EMPRESA.nome} no WhatsApp
        </a>
      </div>
    </div>
  );
}

const chipHero = {
  background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.28)",
  color: "#fff", fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 999,
  backdropFilter: "blur(4px)"
};
const chipAttr = {
  background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.24)",
  color: "#fff", fontSize: 13, fontWeight: 700, padding: "6px 14px", borderRadius: 999,
  display: "inline-flex", alignItems: "center", gap: 6, backdropFilter: "blur(4px)"
};
const popItem = { display: "block", padding: "10px 14px", fontSize: 13.5, color: "var(--text)", textDecoration: "none", borderRadius: 10, cursor: "pointer" };
