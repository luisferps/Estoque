import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useImoveis } from "../shared/hooks";
import { RODAPE, EMPRESA } from "../constants";
import {
  formatBRL, isLote, isLocacao, isVenda, statusDoImovel, apareceNoSite, temRodape, descricaoPronta
} from "../shared/utils";
import { pageWrap } from "../shared/styles";
import Lightbox from "../shared/Lightbox";
import Header from "./Header";

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
      <div>
        <Header />
        <div style={{ ...pageWrap(), textAlign: "center", padding: "4rem 1rem" }}>
          <h2 style={{ color: "var(--text)" }}>Imóvel não disponível</h2>
          <p style={{ color: "var(--text-muted)" }}>Este imóvel não está mais disponível ou foi removido.</p>
          <button onClick={() => navigate("/")} className="btn-grad" style={{ marginTop: 16, padding: "11px 26px", borderRadius: 14, fontWeight: 700 }}>
            Ver outros imóveis
          </button>
        </div>
      </div>
    );
  }

  const isLot = isLote(im);
  const isLoc = isLocacao(im);
  const isVen = isVenda(im);
  const ehLancamento = im.estadoImovel === "Imóvel Novo";

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
    <div className="card-soft" style={{ padding: "1.25rem 1.4rem", marginBottom: "1rem" }}>
      <p style={{ margin: "0 0 14px", fontWeight: 800, fontSize: 12.5, color: "var(--primary)", letterSpacing: 0.6, textTransform: "uppercase" }}>{titulo}</p>
      {children}
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      <Header />
      <Lightbox idx={lb} fotos={im.fotos || []} onClose={() => setLb(null)} onChange={setLb} />

      {/* HERO */}
      <div style={{
        position: "relative",
        background: "radial-gradient(120% 130% at 50% -12%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 42%), linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)",
        color: "#fff", padding: "1.4rem 1.5rem 2rem", borderRadius: "0 0 30px 30px"
      }}>
        <div style={{ maxWidth: 880, margin: "0 auto" }}>
          <button onClick={() => navigate("/")} style={{
            display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)",
            border: "1px solid rgba(255,255,255,0.28)", color: "#fff", fontSize: 13, fontWeight: 600,
            padding: "7px 14px", borderRadius: 999, cursor: "pointer", backdropFilter: "blur(6px)"
          }}>← Voltar</button>

          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            {ehLancamento && <span style={chipHero}>✨ Lançamento</span>}
            {im.tipo && <span style={chipHero}>{im.tipo}</span>}
            {im.transacao && <span style={chipHero}>{im.transacao}</span>}
            {im.condominio && <span style={chipHero}>Em condomínio</span>}
          </div>

          <h1 className="display" style={{ margin: "10px 0 4px", fontSize: "clamp(26px, 4.2vw, 38px)", fontWeight: 800, lineHeight: 1.1 }}>{im.titulo}</h1>
          {(im.codigo || im.bairro || im.cidade) && (
            <p style={{ margin: 0, fontSize: 14, opacity: 0.92, fontWeight: 600, letterSpacing: 0.2 }}>
              {im.codigo ? <>CÓD: {String(im.codigo).toUpperCase()}{(im.bairro || im.cidade) ? " · " : ""}</> : null}
              {[im.bairro, im.cidade].filter(Boolean).join(", ").toUpperCase()}
            </p>
          )}
        </div>
      </div>

      {/* CONTEÚDO */}
      <div style={{ maxWidth: 880, margin: "-22px auto 0", padding: "0 1.25rem", position: "relative", zIndex: 2 }}>
        {/* Galeria */}
        {im.fotos?.length > 0 ? (
          <div className="card-soft" style={{ padding: 10, marginBottom: "1rem" }}>
            <img src={im.fotos[fotoIdx]} alt="" onClick={() => setLb(fotoIdx)}
              style={{ width: "100%", maxHeight: 520, objectFit: "contain", borderRadius: 14, cursor: "zoom-in", background: "var(--bg-muted)" }} />
            {im.fotos.length > 1 && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, overflowX: "auto", paddingBottom: 4 }}>
                {im.fotos.map((f, i) => (
                  <img key={i} src={f} onClick={() => setFotoIdx(i)} alt=""
                    style={{ width: 76, height: 76, objectFit: "cover", borderRadius: 12, cursor: "pointer", flexShrink: 0, border: i === fotoIdx ? "2px solid var(--primary)" : "1px solid var(--border-soft)" }} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="card-soft" style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60, marginBottom: "1rem" }}>🏠</div>
        )}

        {/* Preço destaque */}
        <div className="card-soft" style={{ padding: "1.3rem 1.5rem", marginBottom: "1rem", background: "linear-gradient(135deg, var(--primary-light) 0%, var(--bg-card) 100%)", border: "1px solid var(--primary-border)" }}>
          {isVen && im.preco && (
            <p style={{ margin: 0, fontSize: 30, fontWeight: 800, color: "var(--primary-dark)", letterSpacing: -0.5 }}>
              {formatBRL(im.preco)}
              <span style={{ fontSize: 13.5, fontWeight: 500, marginLeft: 10, opacity: 0.75 }}>à venda</span>
            </p>
          )}
          {isLoc && im.valorFinal && (
            <p style={{ margin: isVen ? "10px 0 0" : 0, fontSize: 24, fontWeight: 800, color: "var(--primary-dark)" }}>
              {formatBRL(im.valorFinal)}<span style={{ fontSize: 14, fontWeight: 500 }}>/mês</span>
              <span style={{ fontSize: 12.5, fontWeight: 500, marginLeft: 10, opacity: 0.75 }}>(aluguel + condomínio + IPTU)</span>
            </p>
          )}
        </div>

        {/* CTAs: WhatsApp + Compartilhar */}
        <div style={{ display: "flex", gap: 10, marginBottom: "1.4rem", flexWrap: "wrap" }}>
          <a href={linkWa} target="_blank" rel="noreferrer" className="btn-wa" style={{
            flex: "2 1 240px", textAlign: "center", padding: "14px 0",
            borderRadius: 14, fontWeight: 800, fontSize: 16,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8
          }}>
            💬 Tenho interesse — falar no WhatsApp
          </a>
          <div style={{ position: "relative", flex: "1 1 160px" }}>
            <button onClick={() => setShare(s => !s)} className="btn-grad" style={{ width: "100%", padding: "14px 0", borderRadius: 14, fontWeight: 800, fontSize: 15 }}>
              ↗ Compartilhar
            </button>
            {share && <CompartilharPopup im={im} onCopiarTexto={copiarDescricao} copiado={copiado} onClose={() => setShare(false)} />}
          </div>
        </div>

        {section("Características", <>
          {im.estadoImovel && row("Estado", im.estadoImovel)}
          {im.metragem && row("Metragem construída", im.metragem + " m²")}
          {im.metragemTotal && row("Metragem do terreno", im.metragemTotal + " m²")}
          {!isLot && parseInt(im.quartos) > 0 && row("Quartos", im.quartos)}
          {!isLot && parseInt(im.suites) > 0 && row("Suítes", im.suites)}
          {!isLot && parseInt(im.banheiros) > 0 && row("Banheiros", im.banheiros)}
          {parseInt(im.garagens) > 0 && row("Garagens", im.garagens)}
          {im.tipo === "Apartamento" && parseFloat(im.valorCondominio) > 0 && row("Condomínio", formatBRL(im.valorCondominio))}
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

        {isLoc && section("Detalhamento da locação", <>
          {row("Aluguel", formatBRL(im.valorAluguel))}
          {row("Condomínio", formatBRL(im.valorCondominio))}
          {row("IPTU", formatBRL(im.valorIPTU))}
          {im.valorFinal && (
            <p style={{ margin: "8px 0 0", fontSize: 16, color: "var(--primary)", fontWeight: 700 }}>
              Total mensal: {formatBRL(im.valorFinal)}
            </p>
          )}
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

        {im.mapsLink && (
          <a href={im.mapsLink} target="_blank" rel="noreferrer" className="card-soft" style={{
            display: "inline-flex", alignItems: "center", gap: 8, marginBottom: "1rem",
            padding: "11px 20px", color: "var(--primary)",
            border: "1px solid var(--primary)", borderRadius: 14,
            fontSize: 14, textDecoration: "none", fontWeight: 700
          }}>
            📍 Ver localização no Google Maps
          </a>
        )}

        <div className="card-soft" style={{
          background: "linear-gradient(135deg, var(--primary-light) 0%, var(--bg-card) 100%)",
          border: "1px solid var(--primary-border)", padding: "1.4rem 1rem", textAlign: "center", margin: "1rem 0"
        }}>
          <p style={{ margin: "0 0 6px", fontSize: 16, color: "var(--primary-dark)", fontWeight: 800 }}>
            Quer saber mais sobre esse imóvel?
          </p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-soft)" }}>
            Fale agora com um dos nossos corretores. Atendimento rápido e sem compromisso.
          </p>
        </div>

        {!temRodape(im.descricao) && <p style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic", marginTop: "1.5rem", textAlign: "center" }}>{RODAPE}</p>}

        <a href={linkWa} target="_blank" rel="noreferrer" className="btn-wa" style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "14px 0", borderRadius: 14, fontWeight: 800, fontSize: 16,
          marginTop: "0.5rem", marginBottom: "2.5rem"
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
const popItem = { display: "block", padding: "10px 14px", fontSize: 13.5, color: "var(--text)", textDecoration: "none", borderRadius: 10, cursor: "pointer" };
