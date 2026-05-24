import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useImoveis, useAuthUser } from "../shared/hooks";
import { PDF_CAMPOS, RODAPE } from "../constants";
import {
  formatBRL, isLote, isLocacao, isVenda, statusDoImovel, descricaoCompleta, temRodape,
  whatsappTudo, whatsappDescricao, whatsappMaps, whatsappFotos, downloadFotos, gerarPDF
} from "../shared/utils";
import { btnPrimary, sectionBox, pageWrap } from "../shared/styles";
import Lightbox from "../shared/Lightbox";

export default function MaterialImovel() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user, loading: loadingAuth } = useAuthUser();
  const { imoveis, loading } = useImoveis();
  const im = imoveis.find(i => i.id === id);
  const [fotoIdx, setFotoIdx] = useState(0);
  const [lb, setLb] = useState(null);
  const [copiado, setCopiado] = useState(false);

  if (loadingAuth || loading) return <div style={pageWrap()}>Carregando...</div>;
  if (!user) { navigate("/corretores"); return null; }
  if (!im && imoveis.length === 0) return <div style={pageWrap()}>Carregando...</div>;
  if (!im) return <div style={pageWrap()}>Imóvel não encontrado.</div>;

  const isLot = isLote(im);
  const isLoc = isLocacao(im);
  const isVen = isVenda(im);
  const status = statusDoImovel(im);

  const copiarDescricao = async () => {
    try {
      await navigator.clipboard.writeText(descricaoCompleta(im));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      alert("Não foi possível copiar. Selecione o texto manualmente.");
    }
  };

  const linkGaleria = `${window.location.origin}${window.location.pathname}#galeria-${im.id}`;
  const linkPublico = `${window.location.origin}/imovel/${im.id}`;

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

  return (
    <div style={pageWrap(720)}>
      <Lightbox idx={lb} fotos={im.fotos || []} onClose={() => setLb(null)} onChange={setLb} />

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1rem" }}>
        <button onClick={() => navigate(-1)} style={backBtn}>← Voltar</button>
      </div>

      <div style={{
        background: "var(--bg-section)", border: "1px solid var(--primary-border)",
        borderRadius: 10, padding: "10px 14px", marginBottom: "1.2rem", fontSize: 13, color: "var(--text-soft)"
      }}>
        💼 <strong>Material para você, corretor.</strong> Use os botões abaixo para copiar a descrição, compartilhar pelo WhatsApp ou baixar as fotos.
      </div>

      <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 600, color: "var(--text)" }}>{im.titulo}</h1>
      <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: 14 }}>
        {[im.bairro, im.cidade].filter(Boolean).join(", ")}
      </p>

      <div style={{ display: "flex", gap: 6, marginBottom: "1rem", flexWrap: "wrap" }}>
        {im.tipo && <span style={tag("primary")}>{im.tipo}</span>}
        {im.transacao && <span style={tag()}>{im.transacao}</span>}
        {im.estadoImovel && <span style={tag()}>{im.estadoImovel}</span>}
        <span style={{ ...tag(), background: status === "Disponível" ? "#d4edda" : "var(--bg-muted)", color: status === "Disponível" ? "#155724" : "var(--text-soft)", fontWeight: 600 }}>{status}</span>
        {im.condicoes?.map(c => <span key={c} style={tag("primary")}>{c}</span>)}
      </div>

      {/* FOTOS */}
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

      {/* AÇÕES PRINCIPAIS */}
      <div style={{ background: "var(--bg-section)", borderRadius: 12, padding: "1rem", marginBottom: "1.2rem", border: "1px solid var(--primary-border)" }}>
        <p style={{ margin: "0 0 10px", fontWeight: 500, fontSize: 14, color: "var(--primary-dark)" }}>Material para uso</p>

        <button onClick={copiarDescricao} style={{ ...btnPrimary, width: "100%", padding: "11px 0", marginBottom: 8 }}>
          {copiado ? "✓ Descrição copiada!" : "📋 Copiar descrição pronta"}
        </button>

        <button onClick={() => downloadFotos(im)} style={{ width: "100%", padding: "11px 0", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer", fontSize: 14, marginBottom: 8 }}>
          📥 Baixar todas as fotos
        </button>

        <button onClick={() => gerarPDF([im], PDF_CAMPOS.map(c => c.key), im.titulo)}
          style={{ width: "100%", padding: "11px 0", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer", fontSize: 14, marginBottom: 8 }}>
          📄 Gerar PDF deste imóvel
        </button>

        <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "8px 10px", background: "var(--bg-card)", border: "1px solid var(--border-soft)", borderRadius: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Galeria pública:</span>
          <input readOnly value={linkGaleria} onClick={e => e.target.select()}
            style={{ flex: 1, border: "none", background: "transparent", color: "var(--text)", fontSize: 12, fontFamily: "monospace" }} />
          <button onClick={() => { navigator.clipboard.writeText(linkGaleria); }}
            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border-soft)", background: "var(--bg-muted)", color: "var(--text)", cursor: "pointer", fontSize: 11 }}>
            Copiar
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "8px 10px", background: "var(--bg-card)", border: "1px solid var(--border-soft)", borderRadius: 8 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Ficha pública:</span>
          <input readOnly value={linkPublico} onClick={e => e.target.select()}
            style={{ flex: 1, border: "none", background: "transparent", color: "var(--text)", fontSize: 12, fontFamily: "monospace" }} />
          <button onClick={() => { navigator.clipboard.writeText(linkPublico); }}
            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border-soft)", background: "var(--bg-muted)", color: "var(--text)", cursor: "pointer", fontSize: 11 }}>
            Copiar
          </button>
        </div>
      </div>

      {/* WHATSAPP */}
      <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-soft)", margin: "0 0 8px" }}>Compartilhar via WhatsApp</p>
      <button onClick={() => whatsappTudo(im)} style={{ ...btnPrimary, width: "100%", padding: "13px 0", fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
        Compartilhar tudo
      </button>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <button onClick={() => whatsappDescricao(im)} style={waBtn("#25D366")}>Descrição</button>
        <button onClick={() => whatsappMaps(im)} style={waBtn("#128C7E")}>Localização</button>
        <button onClick={() => whatsappFotos(im)} style={waBtn("#075E54")}>Fotos</button>
      </div>

      {/* PREÇOS */}
      {isVen && im.preco && <p style={{ fontSize: 22, fontWeight: 600, color: "var(--primary)", margin: "0 0 8px" }}>Venda: {formatBRL(im.preco)}</p>}
      {isLoc && (
        <div style={{ marginBottom: "1rem" }}>
          {row("Aluguel", formatBRL(im.valorAluguel))}
          {row("Condomínio", formatBRL(im.valorCondominio))}
          {row("IPTU", formatBRL(im.valorIPTU))}
          {im.valorFinal && <p style={{ fontSize: 18, fontWeight: 600, color: "var(--primary)", margin: "8px 0" }}>Total locação: {formatBRL(im.valorFinal)}/mês</p>}
        </div>
      )}

      {/* LOCALIZAÇÃO */}
      {(im.cidade || im.bairro) && section("Localização", <>
        {row("Cidade", im.cidade)}
        {row("Bairro", im.bairro)}
        {isLot && <>
          {row("Asfalto", im.asfalto ? "Sim" : null)}
          {row("Água", im.agua ? "Sim" : null)}
          {row("Esgoto", im.esgoto ? "Sim" : null)}
        </>}
        {im.mapsLink && (
          <a href={im.mapsLink} target="_blank" rel="noreferrer"
            style={{ display: "inline-block", marginTop: 8, padding: "8px 18px", background: "var(--primary)", color: "#fff", borderRadius: 8, fontSize: 14, textDecoration: "none", fontWeight: 500 }}>
            Ver no Google Maps
          </a>
        )}
      </>)}

      {section("Características", <>
        {row("Estado", im.estadoImovel)}
        {row("Metragem construída", im.metragem ? im.metragem + " m²" : null)}
        {row("Metragem do terreno", im.metragemTotal ? im.metragemTotal + " m²" : null)}
        {im.condominio && row("Em condomínio", im.nomeCondominio || "Sim")}
        {im.condominio && row("Condomínio mensal", formatBRL(im.valorCondominioMensal))}
        {isLot && <>
          {row("Declive", im.declive)}
          {row("Muro", im.muro ? "Sim" : "Não")}
          {row("Esquina", im.esquina ? "Sim" : "Não")}
          {im.retangular
            ? <>{row("Frente", im.frente ? im.frente + " m" : null)}{row("Laterais", im.laterais ? im.laterais + " m" : null)}</>
            : row("Medidas", im.medidas)}
        </>}
        {(im.tipo === "Casa" || im.tipo === "Apartamento") && <>
          {row("Quartos", im.quartos)}
          {row("Suítes", im.suites)}
          {row("Garagens", im.garagens)}
          {row("Valor de avaliação", formatBRL(im.valorAvaliacao))}
          {row("Valor de entrada", formatBRL(im.valorEntrada))}
          {im.tipo === "Apartamento" && row("Condomínio", formatBRL(im.valorCondominio))}
        </>}
      </>)}

      {im.condicoes?.length > 0 && section("Condições comerciais",
        im.condicoes.map(c => <div key={c} style={{ fontSize: 14, marginBottom: 4, color: "var(--text)" }}>{c}{c === "Permuta" && im.permuta ? `: ${im.permuta}` : ""}</div>)
      )}

      {im.descricao && section("Descrição pronta para uso", <>
        <p style={{ fontSize: 14, color: "var(--text-soft)", lineHeight: 1.75, margin: "0 0 12px", whiteSpace: "pre-wrap" }}>{im.descricao}</p>
        {!temRodape(im.descricao) && <p style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic", margin: 0 }}>{RODAPE}</p>}
      </>)}

      {(im.nomeCaptador || im.telefoneCaptador) && section("Captador",
        <>{row("Nome", im.nomeCaptador)}{row("Telefone", im.telefoneCaptador)}</>
      )}

      {/* OBS: dados do proprietário NÃO aparecem aqui — só admin vê */}
    </div>
  );
}

const tag = (variant) => ({
  fontSize: 12,
  background: variant === "primary" ? "var(--primary-light)" : "var(--bg-muted)",
  color: variant === "primary" ? "var(--primary-dark)" : "var(--text-soft)",
  borderRadius: 6, padding: "3px 10px"
});
const waBtn = (bg) => ({ flex: 1, minWidth: 110, padding: "10px 0", borderRadius: 8, border: "none", background: bg, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500 });
const backBtn = { display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", fontSize: 15, cursor: "pointer", color: "var(--primary)", fontWeight: 500, padding: 0 };
