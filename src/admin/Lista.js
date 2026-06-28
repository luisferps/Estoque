import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { excluirImovelBackend, editarImovelBackend } from "../shared/estoqueApi";
import { db } from "../firebase";
import { useImoveis, useTipos } from "../shared/hooks";
import { useUserRole, ehDiretorEfetivo, usuarioSSO } from "../shared/userRole";
import { matchTransacao, ordenarImoveis, statusDoImovel, reservarCodigoImovel, ajustarContadorMinimo, chaveBairro, descricaoPronta, gerarPDF } from "../shared/utils";
import { PDF_CAMPOS } from "../constants";
import ImovelCard from "../shared/ImovelCard";
import Filtros from "../shared/Filtros";

export default function Lista({ onLogout }) {
  const navigate = useNavigate();
  const { imoveis, loading } = useImoveis();
  const { tipos } = useTipos();
  const { user, isAdmin } = useUserRole();
  const ehDiretor = ehDiretorEfetivo(isAdmin);
  const meuEmail = usuarioSSO();
  const souDonoDe = (im) => !!(
    (meuEmail && im.captadorEmail && im.captadorEmail.toLowerCase() === meuEmail) ||
    (user && im.captadorUid && im.captadorUid === user.uid)
  );
  const [search, setSearch] = useState("");
  const [tipo, setTipo] = useState("Todos");
  const [transacao, setTransacao] = useState("Todos");
  const [estado, setEstado] = useState("Todos");
  const [cidade, setCidade] = useState("Todas");
  const [bairro, setBairro] = useState("Todos");
  const [status, setStatus] = useState("Todos");
  const [ordem, setOrdem] = useState("recente");
  const [precoMin, setPrecoMin] = useState("");
  const [precoMax, setPrecoMax] = useState("");
  const [showPDF, setShowPDF] = useState(false);
  const [pdfCampos, setPdfCampos] = useState(PDF_CAMPOS.map(c => c.key));
  const [migrando, setMigrando] = useState(false);

  const cidades = useMemo(() => ["Todas", ...Array.from(new Set(imoveis.map(im => im.cidade).filter(Boolean))).sort()], [imoveis]);

  const bairros = useMemo(() => {
    const base = cidade === "Todas" ? imoveis : imoveis.filter(im => im.cidade === cidade);
    return ["Todos", ...Array.from(new Set(base.map(im => im.bairro).filter(Boolean))).sort()];
  }, [imoveis, cidade]);

  useEffect(() => {
    if (bairro !== "Todos" && !bairros.includes(bairro)) setBairro("Todos");
  }, [bairros, bairro]);

  const semCodigo = useMemo(() => imoveis.filter(im => !(im.codigo || "").trim()).length, [imoveis]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const min = parseFloat(String(precoMin).replace(/[^\d]/g, "")) || 0;
    const max = parseFloat(String(precoMax).replace(/[^\d]/g, "")) || Infinity;
    const precoOk = (im) => {
      if (!precoMin && !precoMax) return true;
      const v = parseFloat(im.preco) || parseFloat(im.valorAluguel) || parseFloat(im.valorFinal) || 0;
      return v >= min && v <= max;
    };
    const base = imoveis.filter(im =>
      (!q || (im.titulo || "").toLowerCase().includes(q) || (im.descricao || "").toLowerCase().includes(q) || (im.cidade || "").toLowerCase().includes(q) || (im.bairro || "").toLowerCase().includes(q) || (im.endereco || "").toLowerCase().includes(q) || (im.codigo || "").toLowerCase().includes(q) || (im.nomeProprietario || "").toLowerCase().includes(q))
      && (tipo === "Todos" || im.tipo === tipo)
      && matchTransacao(im, transacao)
      && (estado === "Todos" || im.estadoImovel === estado)
      && (cidade === "Todas" || im.cidade === cidade)
      && (bairro === "Todos" || im.bairro === bairro)
      && (status === "Todos" || statusDoImovel(im) === status)
      && precoOk(im)
      // Incompletos ("Aguardando finalização") só aparecem pro dono e pro diretor.
      && (im.status !== "Aguardando finalização" || ehDiretor
          || (meuEmail && im.captadorEmail && im.captadorEmail.toLowerCase() === meuEmail)
          || (user && im.captadorUid && im.captadorUid === user.uid))
    );
    return ordenarImoveis(base, ordem);
  }, [imoveis, search, tipo, transacao, estado, cidade, bairro, status, ordem, precoMin, precoMax, ehDiretor, meuEmail, user]);

  const del = async (id) => {
    if (!window.confirm("Excluir?")) return;
    try { await excluirImovelBackend(id); }
    catch (e) { alert("Erro ao excluir: " + e.message); }
  };

  // Abre a página pública do imóvel em nova aba.
  const verNoSite = (im) => {
    window.open(`${window.location.origin}/imovel/${im.id}`, "_blank");
  };

  // Copia a descrição pronta (mesma função da ficha) pro WhatsApp.
  const [copiadoId, setCopiadoId] = useState(null);
  const copiarDescricao = async (im) => {
    const txt = descricaoPronta(im);
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
    setCopiadoId(im.id);
    setTimeout(() => setCopiadoId(null), 2000);
  };

  // Gera código para todos os imóveis que ainda não têm, usando o contador persistente.
  // Primeiro inicializa os contadores com base nos códigos JÁ existentes (para não repetir),
  // depois reserva (atômico) um código novo para cada imóvel sem código.
  const gerarCodigosFaltantes = async () => {
    const faltantes = imoveis
      .filter(im => !(im.codigo || "").trim() && (im.bairro || "").trim())
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    const semBairro = imoveis.filter(im => !(im.codigo || "").trim() && !(im.bairro || "").trim()).length;

    if (faltantes.length === 0) {
      alert(semBairro > 0
        ? `Nenhum imóvel para gerar.\n\n${semBairro} imóvel(is) estão sem código E sem bairro — preencha o bairro deles primeiro.`
        : "Todos os imóveis já têm código. Nada a fazer.");
      return;
    }

    const aviso = `Vou gerar código para ${faltantes.length} imóvel(is) sem código.\n`
      + `Os que já têm código não serão alterados.\n`
      + (semBairro > 0 ? `\n⚠️ ${semBairro} imóvel(is) sem bairro serão ignorados.\n` : "")
      + `\nDeseja continuar?`;
    if (!window.confirm(aviso)) return;

    setMigrando(true);
    let feitos = 0, erros = 0;
    try {
      // 1) Inicializa contadores com base nos maiores números já usados em cada bairro
      //    (assim os códigos novos nunca colidem com os existentes).
      const maxPorBairro = {}; // chaveBairro -> maior numero usado (base conta como 1)
      for (const im of imoveis) {
        const cod = (im.codigo || "").trim();
        const bai = (im.bairro || "").trim();
        if (!cod || !bai) continue;
        const ch = chaveBairro(bai);
        const esc = bai.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const m = cod.match(new RegExp("^" + esc + "(?:\\s+(\\d+))?$", "i"));
        const n = m ? (m[1] ? parseInt(m[1], 10) : 1) : 1; // se nao casa, conta como ocupando 1
        if (!maxPorBairro[ch] || n > maxPorBairro[ch].n) maxPorBairro[ch] = { n, bairro: bai };
      }
      for (const ch of Object.keys(maxPorBairro)) {
        await ajustarContadorMinimo(db, maxPorBairro[ch].bairro, maxPorBairro[ch].n);
      }

      // 2) Reserva um código novo (atômico) para cada imóvel sem código.
      for (const im of faltantes) {
        try {
          const codigo = await reservarCodigoImovel(db, im.bairro);
          await editarImovelBackend(im.id, { codigo });
          feitos++;
        } catch (e) { erros++; }
      }
    } catch (e) {
      alert("Erro na migração: " + e.message);
    }
    setMigrando(false);
    alert(`Pronto!\n${feitos} código(s) gerado(s).` + (erros ? `\n${erros} falha(s).` : ""));
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "1rem" }}>
      {showPDF && <PDFModal imoveis={filtered} pdfCampos={pdfCampos} setPdfCampos={setPdfCampos} onClose={() => setShowPDF(false)} />}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1rem", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "var(--primary-dark)", flex: 1 }}>
          Imóveis ({filtered.length})
        </h2>
        {filtered.length > 0 && (
          <button onClick={() => setShowPDF(true)} style={{ fontSize: 13, padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
            Gerar PDF ({filtered.length})
          </button>
        )}
      </div>

      {/* Migração de códigos faltantes — aparece só se houver imóveis sem código */}
      {semCodigo > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "var(--bg-section)", border: "1px solid var(--primary-border)", borderRadius: 10, padding: "10px 14px", marginBottom: "1rem" }}>
          <span style={{ fontSize: 13, color: "var(--text-soft)" }}>
            🏷️ {semCodigo} imóvel(is) sem código. Gere os códigos pelo bairro de uma vez.
          </span>
          <button onClick={gerarCodigosFaltantes} disabled={migrando}
            style={{ fontSize: 13, padding: "7px 16px", borderRadius: 8, border: "1px solid var(--primary)", background: migrando ? "var(--bg-muted)" : "var(--primary-light)", color: "var(--primary-dark)", cursor: migrando ? "default" : "pointer", fontWeight: 600 }}>
            {migrando ? "Gerando..." : "Gerar códigos faltantes"}
          </button>
        </div>
      )}

      <Filtros
        search={search} setSearch={setSearch}
        tipo={tipo} setTipo={setTipo}
        transacao={transacao} setTransacao={setTransacao}
        estado={estado} setEstado={setEstado}
        cidade={cidade} setCidade={setCidade}
        bairro={bairro} setBairro={setBairro}
        status={status} setStatus={setStatus}
        ordem={ordem} setOrdem={setOrdem}
        cidades={cidades}
        bairros={bairros}
        tipos={tipos}
        showStatus={true}
        showBairro={true}
      />

      {/* Faixa de preço (venda ou aluguel) */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "0 0 1rem" }}>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>💰 Preço de</span>
        <input type="text" inputMode="numeric" placeholder="mínimo" value={precoMin}
          onChange={e => setPrecoMin(e.target.value.replace(/[^\d]/g, ""))}
          style={{ width: 130, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text)", fontSize: 14 }} />
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>até</span>
        <input type="text" inputMode="numeric" placeholder="máximo" value={precoMax}
          onChange={e => setPrecoMax(e.target.value.replace(/[^\d]/g, ""))}
          style={{ width: 130, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text)", fontSize: 14 }} />
        {(precoMin || precoMax) && (
          <button onClick={() => { setPrecoMin(""); setPrecoMax(""); }} style={{ fontSize: 12, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer" }}>limpar preço</button>
        )}
      </div>

      {loading && <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "4rem 0" }}>Carregando...</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "4rem 0" }}>
          {imoveis.length === 0 ? "Nenhum imóvel cadastrado ainda." : "Nenhum imóvel encontrado."}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
        {filtered.map(im => (
          <ImovelCard
            key={im.id}
            im={im}
            onClick={() => navigate(`/admin/imovel/${im.id}`)}
            actions={
              <>
                <button onClick={() => navigate(`/admin/imovel/${im.id}`)} style={miniBtn}>Ficha</button>
                <button onClick={() => verNoSite(im)} style={miniBtn} title="Ver no site">🌐</button>
                <button onClick={() => copiarDescricao(im)} style={{ ...miniBtn, background: copiadoId === im.id ? "#25884f" : undefined, color: copiadoId === im.id ? "#fff" : undefined }} title="Copiar descrição pronta">{copiadoId === im.id ? "✓" : "📝"}</button>
                {(ehDiretor || souDonoDe(im)) && <>
                  <button onClick={() => navigate(`/admin/editar/${im.id}`)} style={miniBtn} title="Editar">✏️</button>
                  <button onClick={() => del(im.id)} style={{ ...miniBtn, border: "1px solid var(--primary-border)", background: "var(--primary-light)" }} title="Excluir">🗑️</button>
                </>}
              </>
            }
          />
        ))}
      </div>
    </div>
  );
}

function PDFModal({ imoveis, pdfCampos, setPdfCampos, onClose }) {
  const todos = pdfCampos.length === PDF_CAMPOS.length;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
      <div style={{ background: "var(--bg-card)", color: "var(--text)", borderRadius: 12, padding: "1.5rem", width: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.2)", maxHeight: "80vh", overflowY: "auto" }}>
        <h3 style={{ margin: "0 0 1rem", fontSize: 17, color: "var(--primary-dark)" }}>Escolha os campos do PDF</h3>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginBottom: 12, fontWeight: 500, color: "var(--primary)" }}>
          <input type="checkbox" checked={todos} onChange={() => setPdfCampos(todos ? [] : PDF_CAMPOS.map(c => c.key))} style={{ width: 15, height: 15, accentColor: "var(--primary)" }} />
          Selecionar todos
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: "1rem" }}>
          {PDF_CAMPOS.map(c => (
            <label key={c.key} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={pdfCampos.includes(c.key)} onChange={() => setPdfCampos(p => p.includes(c.key) ? p.filter(x => x !== c.key) : [...p, c.key])} style={{ width: 15, height: 15, accentColor: "var(--primary)" }} />
              {c.label}
            </label>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer" }}>Cancelar</button>
          <button onClick={() => { onClose(); gerarPDF(imoveis, pdfCampos); }}
            style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontWeight: 500 }}>Gerar PDF</button>
        </div>
      </div>
    </div>
  );
}

const miniBtn = {
  flex: 1, padding: "6px 8px", fontSize: 12, borderRadius: 7,
  border: "1px solid var(--border-soft)", background: "var(--bg-muted)",
  color: "var(--text)", cursor: "pointer"
};
