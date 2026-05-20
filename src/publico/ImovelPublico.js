import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useImoveis } from "../shared/hooks";
import { RODAPE, EMPRESA } from "../constants";
import {
  formatBRL, isLote, isLocacao, isVenda, statusDoImovel
} from "../shared/utils";
import { sectionBox, pageWrap } from "../shared/styles";
import Lightbox from "../shared/Lightbox";
import Header from "./Header";

export default function ImovelPublico() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { imoveis, loading } = useImoveis();
  const im = imoveis.find(i => i.id === id);
  const [fotoIdx, setFotoIdx] = useState(0);
  const [lb, setLb] = useState(null);

  if (loading) return <div style={{ ...pageWrap(), textAlign: "center", padding: "4rem 1rem", color: "var(--text-muted)" }}>Carregando...</div>;

  if (!im || statusDoImovel(im) !== "Disponível") {
    return (
      <div>
        <Header />
        <div style={{ ...pageWrap(), textAlign: "center", padding: "4rem 1rem" }}>
          <h2 style={{ color: "var(--text)" }}>Imóvel não disponível</h2>
          <p style={{ color: "var(--text-muted)" }}>Este imóvel não está mais disponível ou foi removido.</p>
          <button onClick={() => navigate("/")} style={{ marginTop: 16, padding: "10px 24px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontWeight: 500 }}>
            Ver outros imóveis
          </button>
        </div>
      </div>
    );
  }

  const isLot = isLote(im);
  const isLoc = isLocacao(im);
  const isVen = isVenda(im);

  const row = (label, val) => val ? (
    <div style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 14 }}>
      <span style={{ color: "var(--text-muted)", minWidth: 140 }}>{label}</span>
      <span style={{ color: "var(--text)", fontWeight: 500 }}>{val}</span>
    </div>
  ) : null;

  const section = (title, children) => (
    <div style={sectionBox}>
      <p style={{ margin: "0 0 12px", fontWeight: 500, fontSize: 14, color: "var(--primary-dark)" }}>{title}</p>
      {children}
    </div>
  );

  const mensagemWa = `Olá! Tenho interesse no imóvel: ${im.titulo}\n${window.location.href}`;
  const linkWa = `https://wa.me/${EMPRESA.whatsapp}?text=${encodeURIComponent(mensagemWa)}`;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      <Header />
      <Lightbox idx={lb} fotos={im.fotos || []} onClose={() => setLb(null)} onChange={setLb} />

      <div style={pageWrap(720)}>
        <div style={{ marginBottom: "1rem" }}>
          <button onClick={() => navigate("/")} style={backBtn}>← Voltar para a lista</button>
        </div>

        <h1 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 600, color: "var(--text)" }}>{im.titulo}</h1>
        <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: 14 }}>
          {[im.bairro, im.cidade].filter(Boolean).join(", ")}
        </p>

        <div style={{ display: "flex", gap: 6, marginBottom: "1rem", flexWrap: "wrap" }}>
          {im.tipo && <span style={tag("primary")}>{im.tipo}</span>}
          {im.transacao && <span style={tag()}>{im.transacao}</span>}
          {im.estadoImovel && <span style={tag()}>{im.estadoImovel}</span>}
          {im.condominio && <span style={tag()}>Em condomínio</span>}
          {im.condicoes?.map(c => <span key={c} style={tag("primary")}>{c}</span>)}
        </div>

        {im.fotos?.length > 0 ? (
          <div style={{ marginBottom: "1.2rem" }}>
            <img src={im.fotos[fotoIdx]} alt="" onClick={() => setLb(fotoIdx)}
              style={{ width: "100%", maxHeight: 480, objectFit: "contain", borderRadius: 12, border: "1px solid var(--border)", cursor: "zoom-in", background: "var(--bg-muted)" }} />
            {im.fotos.length > 1 && (
              <div style={{ display: "flex", gap: 8, marginTop: 8, overflowX: "auto", paddingBottom: 4 }}>
                {im.fotos.map((f, i) => (
                  <img key={i} src={f} onClick={() => setFotoIdx(i)} alt=""
                    style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, cursor: "pointer", flexShrink: 0, border: i === fotoIdx ? "2px solid var(--primary)" : "1px solid var(--border-soft)" }} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ height: 200, background: "var(--bg-muted)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60, marginBottom: "1.2rem" }}>🏠</div>
        )}

        {/* Preço destaque */}
        <div style={{ background: "var(--primary-light)", borderRadius: 12, padding: "1.2rem", marginBottom: "1.2rem", border: "1px solid var(--primary-border)" }}>
          {isVen && im.preco && (
            <p style={{ margin: 0, fontSize: 26, fontWeight: 600, color: "var(--primary-dark)" }}>
              {formatBRL(im.preco)}
              <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 8 }}>à venda</span>
            </p>
          )}
          {isLoc && im.valorFinal && (
            <p style={{ margin: isVen ? "8px 0 0" : 0, fontSize: 22, fontWeight: 600, color: "var(--primary-dark)" }}>
              {formatBRL(im.valorFinal)}
              <span style={{ fontSize: 14, fontWeight: 400 }}>/mês</span>
              <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 8 }}>(aluguel + condomínio + IPTU)</span>
            </p>
          )}
        </div>

        {/* CTA WhatsApp */}
        <a href={linkWa} target="_blank" rel="noreferrer" style={{
          display: "block", textAlign: "center",
          background: "#25D366", color: "#fff", padding: "14px 0",
          borderRadius: 10, fontWeight: 600, fontSize: 16, textDecoration: "none",
          marginBottom: "1.2rem"
        }}>
          💬 Tenho interesse — falar no WhatsApp
        </a>

        {section("Características", <>
          {im.metragem && row("Metragem construída", im.metragem + " m²")}
          {im.metragemTotal && row("Metragem do terreno", im.metragemTotal + " m²")}
          {!isLot && parseInt(im.quartos) > 0 && row("Quartos", im.quartos)}
          {!isLot && parseInt(im.suites) > 0 && row("Suítes", im.suites)}
          {!isLot && parseInt(im.garagens) > 0 && row("Garagens", im.garagens)}
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

        {isLoc && (
          <div style={sectionBox}>
            <p style={{ margin: "0 0 12px", fontWeight: 500, fontSize: 14, color: "var(--primary-dark)" }}>Detalhamento da locação</p>
            {row("Aluguel", formatBRL(im.valorAluguel))}
            {row("Condomínio", formatBRL(im.valorCondominio))}
            {row("IPTU", formatBRL(im.valorIPTU))}
            {im.valorFinal && (
              <p style={{ margin: "8px 0 0", fontSize: 16, color: "var(--primary)", fontWeight: 600 }}>
                Total mensal: {formatBRL(im.valorFinal)}
              </p>
            )}
          </div>
        )}

        {im.descricao && section("Descrição", (
          <p style={{ fontSize: 14, color: "var(--text-soft)", lineHeight: 1.75, margin: 0, whiteSpace: "pre-wrap" }}>
            {im.descricao}
          </p>
        ))}

        {im.mapsLink && (
          <a href={im.mapsLink} target="_blank" rel="noreferrer" style={{
            display: "inline-block", marginBottom: "1.2rem",
            padding: "10px 20px", background: "var(--bg-card)", color: "var(--primary)",
            border: "1px solid var(--primary)", borderRadius: 8,
            fontSize: 14, textDecoration: "none", fontWeight: 500
          }}>
            📍 Ver localização no Google Maps
          </a>
        )}

        <p style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic", marginTop: "1.5rem" }}>{RODAPE}</p>

        {/* CTA WhatsApp duplo no final */}
        <a href={linkWa} target="_blank" rel="noreferrer" style={{
          display: "block", textAlign: "center",
          background: "#25D366", color: "#fff", padding: "14px 0",
          borderRadius: 10, fontWeight: 600, fontSize: 16, textDecoration: "none",
          marginTop: "1rem"
        }}>
          💬 Falar com a {EMPRESA.nome} no WhatsApp
        </a>
      </div>
    </div>
  );
}

const tag = (variant) => ({
  fontSize: 12,
  background: variant === "primary" ? "var(--primary-light)" : "var(--bg-muted)",
  color: variant === "primary" ? "var(--primary-dark)" : "var(--text-soft)",
  borderRadius: 6, padding: "3px 10px"
});

const backBtn = { display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", fontSize: 14, cursor: "pointer", color: "var(--primary)", fontWeight: 500, padding: 0 };
