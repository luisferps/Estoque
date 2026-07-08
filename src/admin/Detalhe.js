import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { excluirImovelBackend, criarImovelBackend } from "../shared/estoqueApi";
import { CANAIS, RODAPE, PDF_CAMPOS } from "../constants";
import { useImoveis } from "../shared/hooks";
import { useUserRole, ehDiretorEfetivo, usuarioSSO } from "../shared/userRole";
import {
  formatBRL, isLote, isLocacao, isVenda, statusDoImovel, temRodape,
  descricaoPronta, downloadFotos, gerarPDF
} from "../shared/utils";
import { btnPrimary, sectionBox, pageWrap } from "../shared/styles";
import Lightbox from "../shared/Lightbox";

function linkWA(telefone) {
  if (!telefone) return null;
  const d = String(telefone).replace(/\D/g, "");
  const num = d.startsWith("55") ? d : "55" + d;
  return `https://wa.me/${num}`;
}

function LinhaContato({ label, nome, telefone, mostrarTelefone }) {
  if (!nome && !telefone) return null;
  const wa = mostrarTelefone && telefone ? linkWA(telefone) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
      {nome && (
        <div style={{ display: "flex", gap: 8, fontSize: 14 }}>
          <span style={{ color: "var(--text-muted)", minWidth: 140 }}>{label}</span>
          <span style={{ color: "var(--text)", fontWeight: 500 }}>{nome}</span>
        </div>
      )}
      {mostrarTelefone && telefone && (
        <div style={{ display: "flex", gap: 8, fontSize: 14, alignItems: "center" }}>
          <span style={{ color: "var(--text-muted)", minWidth: 140 }}>Telefone</span>
          <span style={{ color: "var(--text)", fontWeight: 500 }}>{telefone}</span>
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", background: "#25D366", color: "#fff", borderRadius: 6, fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
              💬 WhatsApp
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function Detalhe() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { imoveis } = useImoveis();
  const { user, isAdmin } = useUserRole();
  const im = imoveis.find(i => i.id === id);
  const [fotoIdx, setFotoIdx] = useState(0);
  const [lb, setLb] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [mostrarSensiveis, setMostrarSensiveis] = useState(false);

  if (!im) return <div style={pageWrap()}>Carregando...</div>;

  const isLot = isLote(im);
  const isLoc = isLocacao(im);
  const isVen = isVenda(im);

  const galeriaLink = im.fotos?.length ? `https://fotosdoimovel.netlify.app/fotos/${im.id}` : "";
  const ehDiretor = ehDiretorEfetivo(isAdmin);
  const meuEmail = usuarioSSO();
  // Estrela da captação (dono da edição), casada por email do captador principal.
  const souDono = !!(
    (meuEmail && im.captadorEmail && im.captadorEmail.toLowerCase() === meuEmail) ||
    (user && im.captadorUid && im.captadorUid === user.uid)
  );
  // Participa da CAPTAÇÃO deste imóvel? = está na divisão de captação (por email).
  // Usado só para liberar dados sensíveis (contato do proprietário), não a edição.
  const souCaptadorDoImovel = !!(
    souDono ||
    (meuEmail && Array.isArray(im.captadores_detalhes) && im.captadores_detalhes.some(c =>
      c && c.tipo === "interno" && c.email && String(c.email).toLowerCase() === meuEmail))
  );
  // Editar/captar: só a estrela (ou diretor).
  const podeEditar = ehDiretor || souDono;
  // Ver contato do proprietário (sensível): qualquer captador do imóvel (ou diretor).
  const podeVerProprietario = ehDiretor || souCaptadorDoImovel;
  const podeVerAnuncios = ehDiretor;

  // Captador: público para todos no sistema
  const nomeCaptador = im.nomeCaptador || "";
  const telCaptador = im.telefoneCaptador || "";
  const temCaptador = !!(nomeCaptador || telCaptador);

  // Proprietário: só dono/gerente/diretor
  const temProprietario = !!(im.nomeProprietario || im.telefoneProprietario) && podeVerProprietario;

  const copiarDescricao = async () => {
    const txt = descricaoPronta(im);
    try {
      await navigator.clipboard.writeText(txt);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch {}
      document.body.removeChild(ta);
    }
  };

  const pdfImovel = () => gerarPDF([im], PDF_CAMPOS.map(c => c.key), im.titulo || "Imóvel");

  const del = async () => {
    if (!window.confirm("Excluir esse imóvel?")) return;
    try { await excluirImovelBackend(id); navigate("/admin"); }
    catch (e) { alert("Erro ao excluir: " + e.message); }
  };

  const duplicar = async () => {
    if (!window.confirm(`Duplicar "${im.titulo}"?`)) return;
    const { id: _id, createdAt: _ca, ...data } = im;
    try {
      const novoId = await criarImovelBackend({
        ...data,
        titulo: `${data.titulo} (cópia)`,
        anuncios: {},
      });
      navigate(`/admin/editar/${novoId}`);
    } catch (e) { alert("Erro ao duplicar: " + e.message); }
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
        {podeEditar && <button onClick={() => navigate(`/admin/editar/${im.id}`)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer", fontSize: 13 }}>Editar</button>}
        <button onClick={duplicar} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer", fontSize: 13 }}>📋 Duplicar</button>
        <button onClick={del} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--primary-border)", background: "var(--primary-light)", color: "var(--primary-dark)", cursor: "pointer", fontSize: 13 }}>🗑️</button>
      </div>

      {im.status === "Aguardando finalização" && (
        <div style={{ background: "var(--primary-light)", border: "1px solid var(--primary-border)", borderRadius: 10, padding: "12px 16px", marginBottom: "1rem", color: "var(--primary-dark)", fontSize: 13.5 }}>
          <b>⚠️ Aguardando finalização</b> — este imóvel ainda não está publicado.
          {Array.isArray(im.faltandoFinalizar) && im.faltandoFinalizar.length > 0 && (
            <> Falta preencher: <b>{im.faltandoFinalizar.join(", ")}</b>.</>
          )}
        </div>
      )}

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
        {!temRodape(im.descricao) && <p style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic", margin: 0 }}>{RODAPE}</p>}
      </>)}

      {/* Captador: visível para todos no sistema */}
      {temCaptador && section("Captador", <>
        <LinhaContato label="Nome" nome={nomeCaptador} telefone={telCaptador} mostrarTelefone={true} />
      </>)}

      {/* Proprietário + captador (sensíveis): escondidos por padrão */}
      {temProprietario && (
        !mostrarSensiveis ? (
          <button onClick={() => setMostrarSensiveis(true)}
            style={{ width: "100%", padding: "11px 0", borderRadius: 8, border: "1px dashed var(--border-soft)", background: "var(--bg-muted)", color: "var(--text-soft)", cursor: "pointer", fontSize: 14, marginBottom: "1rem" }}>
            👁️ Ver dados do proprietário
          </button>
        ) : (
          <>
            <button onClick={() => setMostrarSensiveis(false)}
              style={{ width: "100%", padding: "9px 0", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text-soft)", cursor: "pointer", fontSize: 13, marginBottom: 10 }}>
              🙈 Ocultar dados do proprietário
            </button>
            {section("Proprietário", <>
              <LinhaContato label="Nome" nome={im.nomeProprietario} telefone={im.telefoneProprietario} mostrarTelefone={true} />
            </>)}
          </>
        )
      )}

      {podeVerAnuncios && Object.values(im.anuncios || {}).some(a => a?.ativo) && section("Anúncios",
        CANAIS.filter(c => im.anuncios?.[c]?.ativo).map(c => (
          <div key={c} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
            <span>{c}</span><span style={{ color: "var(--text-muted)" }}>{im.anuncios[c].data}</span>
          </div>
        ))
      )}

      <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-soft)", margin: "1.5rem 0 8px" }}>Divulgação</p>

      <button onClick={copiarDescricao} style={{ ...btnPrimary, width: "100%", padding: "13px 0", fontSize: 15, fontWeight: 700, marginBottom: 10, background: copiado ? "#25884f" : "var(--primary)" }}>
        {copiado ? "✓ Copiado! Cole no WhatsApp" : "📋 Criar descrição pronta (copiar tudo)"}
      </button>

      {galeriaLink && (
        <div style={{ marginBottom: 8 }}>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 4px" }}>Link das fotos (galeria):</p>
          <a href={galeriaLink} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "var(--primary)", wordBreak: "break-all" }}>{galeriaLink}</a>
        </div>
      )}

      {im.mapsLink && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 4px" }}>Localização:</p>
          <a href={im.mapsLink} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "var(--primary)", wordBreak: "break-all" }}>{im.mapsLink}</a>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={pdfImovel} style={{ flex: 1, minWidth: 140, padding: "11px 0", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer", fontSize: 14 }}>
          📄 Gerar PDF
        </button>
        <button onClick={() => downloadFotos(im)} style={{ flex: 1, minWidth: 140, padding: "11px 0", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer", fontSize: 14 }}>
          ⬇️ Baixar todas as fotos
        </button>
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

const STATUS_BG = { "Disponível": "#d4edda", "Reservado": "#fff3cd", "Vendido": "#f8d7da", "Alugado": "#d1ecf1" };
const STATUS_FG = { "Disponível": "#155724", "Reservado": "#856404", "Vendido": "#721c24", "Alugado": "#0c5460" };
const backBtn = { display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", fontSize: 15, cursor: "pointer", color: "var(--primary)", fontWeight: 500, padding: 0 };
