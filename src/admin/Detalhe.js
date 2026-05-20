import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { addDoc, collection, deleteDoc, doc } from "firebase/firestore";
import { db } from "../firebase";
import { CANAIS, RODAPE } from "../constants";
import { useImoveis } from "../shared/hooks";
import {
  formatBRL, isLote, isLocacao, isVenda, statusDoImovel,
  whatsappTudo, whatsappDescricao, whatsappMaps, whatsappFotos, downloadFotos
} from "../shared/utils";
import { btnPrimary, sectionBox, pageWrap } from "../shared/styles";
import Lightbox from "../shared/Lightbox";

export default function Detalhe() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { imoveis } = useImoveis();
  const im = imoveis.find(i => i.id === id);
  const [fotoIdx, setFotoIdx] = useState(0);
  const [lb, setLb] = useState(null);

  if (!im) return <div style={pageWrap()}>Carregando...</div>;

  const isLot = isLote(im);
  const isLoc = isLocacao(im);
  const isVen = isVenda(im);

  const del = async () => {
    if (!window.confirm("Excluir esse imóvel?")) return;
    await deleteDoc(doc(db, "imoveis", id));
    navigate("/admin");
  };

  const duplicar = async () => {
    if (!window.confirm(`Duplicar "${im.titulo}"?`)) return;
    const { id: _id, createdAt: _ca, ...data } = im;
    const docRef = await addDoc(collection(db, "imoveis"), {
      ...data,
      titulo: `${data.titulo} (cópia)`,
      anuncios: {},
      createdAt: Date.now()
    });
    navigate(`/admin/editar/${docRef.id}`);
  };

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

  const status = statusDoImovel(im);

  return (
    <div style={pageWrap(680)}>
      <Lightbox idx={lb} fotos={im.fotos || []} onClose={() => setLb(null)} onChange={setLb} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1rem", flexWrap: "wrap" }}>
        <button onClick={() => navigate(-1)} style={backBtn}>← Voltar</button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, flex: 1, color: "var(--text)" }}>{im.titulo || "Ficha do imóvel"}</h2>
        <button onClick={() => navigate(`/admin/editar/${im.id}`)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer", fontSize: 13 }}>Editar</button>
        <button onClick={duplicar} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer", fontSize: 13 }}>📋 Duplicar</button>
        <button onClick={del} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--primary-border)", background: "var(--primary-light)", color: "var(--primary-dark)", cursor: "pointer", fontSize: 13 }}>🗑️</button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: "1rem", flexWrap: "wrap" }}>
        {im.tipo && <span style={tag("primary")}>{im.tipo}</span>}
        {im.transacao && <span style={tag()}>{im.transacao}</span>}
        {im.estadoImovel && <span style={tag()}>{im.estadoImovel}</span>}
        <span style={{ ...tag(), background: STATUS_BG[status] || "var(--bg-muted)", color: STATUS_FG[status] || "var(--text-soft)", fontWeight: 600 }}>{status}</span>
        {im.condominio && <span style={tag()}>Condomínio{im.nomeCondominio ? `: ${im.nomeCondominio}` : ""}</span>}
        {im.condicoes?.map(c => <span key={c} style={tag("primary")}>{c}</span>)}
      </div>

      {im.fotos?.length > 0 ? (
        <div style={{ marginBottom: "1.2rem" }}>
          <img src={im.fotos[fotoIdx]} alt="" onClick={() => setLb(fotoIdx)}
            style={{ width: "100%", maxHeight: 400, objectFit: "contain", borderRadius: 12, border: "1px solid var(--border)", cursor: "zoom-in", background: "var(--bg-muted)" }} />
          {im.fotos.length > 1 && (
            <div style={{ display: "flex", gap: 8, marginTop: 8, overflowX: "auto" }}>
              {im.fotos.map((f, i) => (
                <img key={i} src={f} onClick={() => setFotoIdx(i)} alt=""
                  style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, cursor: "pointer", flexShrink: 0, border: i === fotoIdx ? "2px solid var(--primary)" : "1px solid var(--border-soft)" }} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ height: 180, background: "var(--bg-muted)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60, marginBottom: "1.2rem" }}>🏠</div>
      )}

      {isVen && im.preco && <p style={{ fontSize: 24, fontWeight: 500, color: "var(--primary)", margin: "0 0 8px" }}>Venda: {formatBRL(im.preco)}</p>}
      {isLoc && (
        <div style={{ marginBottom: "1rem" }}>
          {row("Aluguel", formatBRL(im.valorAluguel))}
          {row("Condomínio", formatBRL(im.valorCondominio))}
          {row("IPTU", formatBRL(im.valorIPTU))}
          {im.valorFinal && <p style={{ fontSize: 20, fontWeight: 500, color: "var(--primary)", margin: "8px 0" }}>Total locação: {formatBRL(im.valorFinal)}/mês</p>}
        </div>
      )}

      {(im.cidade || im.bairro) && section("Localização", <>
        {row("Cidade", im.cidade)}
        {row("Bairro", im.bairro)}
        {row("Endereço", im.endereco)}
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
        {row("Metragem", im.metragem ? im.metragem + " m²" : null)}
        {row("Metragem total", im.metragemTotal ? im.metragemTotal + " m²" : null)}
        {im.condominio && row("Condomínio mensal", formatBRL(im.valorCondominioMensal))}
        {isLot && <>
          {row("Declive", im.declive)}
          {row("Muro", im.muro ? "Sim" : "Não")}
          {row("Esquina", im.esquina ? "Sim" : "Não")}
          {row("Retangular", im.retangular ? "Sim" : "Não")}
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

      {im.descricao && section("Descrição", <>
        <p style={{ fontSize: 14, color: "var(--text-soft)", lineHeight: 1.75, margin: "0 0 12px", whiteSpace: "pre-wrap" }}>{im.descricao}</p>
        {!im.descricao.includes(RODAPE) && <p style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic", margin: 0 }}>{RODAPE}</p>}
      </>)}

      {(im.nomeCaptador || im.telefoneCaptador) && section("Captador", <>{row("Nome", im.nomeCaptador)}{row("Telefone", im.telefoneCaptador)}</>)}

      {(im.nomeProprietario || im.telefoneProprietario) && section("Proprietário", <>{row("Nome", im.nomeProprietario)}{row("Telefone", im.telefoneProprietario)}</>)}

      {Object.values(im.anuncios || {}).some(a => a?.ativo) && section("Anúncios",
        CANAIS.filter(c => im.anuncios?.[c]?.ativo).map(c => (
          <div key={c} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
            <span>{c}</span><span style={{ color: "var(--text-muted)" }}>{im.anuncios[c].data}</span>
          </div>
        ))
      )}

      <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-soft)", margin: "1.5rem 0 8px" }}>Compartilhar via WhatsApp</p>
      <button onClick={() => whatsappTudo(im)} style={{ ...btnPrimary, width: "100%", padding: "13px 0", fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
        Compartilhar tudo
      </button>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <button onClick={() => whatsappDescricao(im)} style={{ flex: 1, minWidth: 110, padding: "10px 0", borderRadius: 8, border: "none", background: "#25D366", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>Descrição</button>
        <button onClick={() => whatsappMaps(im)} style={{ flex: 1, minWidth: 110, padding: "10px 0", borderRadius: 8, border: "none", background: "#128C7E", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>Localização</button>
        <button onClick={() => whatsappFotos(im)} style={{ flex: 1, minWidth: 110, padding: "10px 0", borderRadius: 8, border: "none", background: "#075E54", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>Fotos</button>
      </div>
      <button onClick={() => downloadFotos(im)} style={{ width: "100%", padding: "11px 0", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer", fontSize: 14 }}>
        Baixar todas as fotos
      </button>
    </div>
  );
}

const tag = (variant) => ({
  fontSize: 12,
  background: variant === "primary" ? "var(--primary-light)" : "var(--bg-muted)",
  color: variant === "primary" ? "var(--primary-dark)" : "var(--text-soft)",
  borderRadius: 6, padding: "3px 10px"
});

const STATUS_BG = { "Disponível": "#d4edda", "Reservado": "#fff3cd", "Vendido": "#f8d7da", "Alugado": "#d1ecf1" };
const STATUS_FG = { "Disponível": "#155724", "Reservado": "#856404", "Vendido": "#721c24", "Alugado": "#0c5460" };
const backBtn = { display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", fontSize: 15, cursor: "pointer", color: "var(--primary)", fontWeight: 500, padding: 0 };
