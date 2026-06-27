import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { excluirImovelBackend, editarImovelBackend } from "../shared/estoqueApi";
import { db } from "../firebase";
import { useImoveis, useTipos } from "../shared/hooks";
import { useUserRole, ehDiretorEfetivo, usuarioSSO } from "../shared/userRole";
import { matchTransacao, ordenarImoveis, statusDoImovel, reservarCodigoImovel, ajustarContadorMinimo, chaveBairro, descricaoPronta } from "../shared/utils";
import { btnPrimary } from "../shared/styles";
import { DarkModeToggle } from "../shared/ThemeProvider";
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
  const [status, setStatus] = useState("Todos");
  const [ordem, setOrdem] = useState("recente");
  const [migrando, setMigrando] = useState(false);

  const cidades = useMemo(() => ["Todas", ...Array.from(new Set(imoveis.map(im => im.cidade).filter(Boolean))).sort()], [imoveis]);

  const semCodigo = useMemo(() => imoveis.filter(im => !(im.codigo || "").trim()).length, [imoveis]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const base = imoveis.filter(im =>
      (!q || (im.titulo || "").toLowerCase().includes(q) || (im.descricao || "").toLowerCase().includes(q) || (im.cidade || "").toLowerCase().includes(q) || (im.bairro || "").toLowerCase().includes(q) || (im.endereco || "").toLowerCase().includes(q) || (im.codigo || "").toLowerCase().includes(q) || (im.nomeProprietario || "").toLowerCase().includes(q))
      && (tipo === "Todos" || im.tipo === tipo)
      && matchTransacao(im, transacao)
      && (estado === "Todos" || im.estadoImovel === estado)
      && (cidade === "Todas" || im.cidade === cidade)
      && (status === "Todos" || statusDoImovel(im) === status)
      // Incompletos ("Aguardando finalização") só aparecem pro dono e pro diretor.
      && (im.status !== "Aguardando finalização" || ehDiretor
          || (meuEmail && im.captadorEmail && im.captadorEmail.toLowerCase() === meuEmail)
          || (user && im.captadorUid && im.captadorUid === user.uid))
    );
    return ordenarImoveis(base, ordem);
  }, [imoveis, search, tipo, transacao, estado, cidade, status, ordem, ehDiretor, meuEmail, user]);

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
  const [hoverFoto, setHoverFoto] = useState(null); // {id, x, y} para prévia de foto
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

  const loc = window.location.pathname;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* CABEÇALHO FIXO */}
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: "var(--bg-card)", borderBottom: "1px solid var(--border-soft)", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 1rem" }}>
          {/* Linha 1: título + ações */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0 6px", flexWrap: "wrap", gap: 6 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "var(--primary-dark)" }}>
              Inerente — Imóveis ({filtered.length})
            </h2>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <DarkModeToggle />
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>{ehDiretor ? "Diretor" : "Corretor"}</span>
              <button onClick={onLogout} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border-soft)", background: "var(--bg-muted)", color: "var(--text)", cursor: "pointer" }}>Sair</button>
              <button onClick={() => navigate("/admin/novo")} style={btnPrimary}>+ Novo</button>
            </div>
          </div>
          {/* Linha 2: abas de navegação */}
          <div style={{ display: "flex", gap: 2, overflowX: "auto", paddingBottom: 0 }}>
            {[
              { label: "🏠 Imóveis", path: "/admin" },
              { label: "🔍 Consulta", path: "/admin/consulta" },
              ...(ehDiretor ? [
                { label: "📢 Anúncios", path: "/admin/anuncios" },
                { label: "🏠 Rotação", path: "/admin/rotacao" },
                { label: "⭐ Destaques", path: "/admin/destaques" },
                { label: "👥 Corretores", path: "/admin/corretores" },
                { label: "📥 Importar", path: "/admin/importar" },
                { label: "🏷️ Tipos", path: "/admin/tipos" },
              ] : []),
              { label: "🌐 Site", path: "/", externo: true },
            ].map(aba => (
              <button key={aba.path} onClick={() => aba.externo ? window.open("/", "_blank") : navigate(aba.path)}
                style={{
                  padding: "8px 14px", fontSize: 12, fontWeight: 600, border: "none",
                  background: "none", cursor: "pointer", whiteSpace: "nowrap",
                  borderBottom: loc === aba.path ? "2px solid var(--primary)" : "2px solid transparent",
                  color: loc === aba.path ? "var(--primary)" : "var(--text-soft)",
                  borderRadius: 0,
                }}>
                {aba.label}
              </button>
            ))}
          </div>
        </div>
      </div>

    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "1rem" }}>

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
        status={status} setStatus={setStatus}
        ordem={ordem} setOrdem={setOrdem}
        cidades={cidades}
        tipos={tipos}
        showStatus={true}
      />

      {loading && <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "4rem 0" }}>Carregando...</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "4rem 0" }}>
          {imoveis.length === 0 ? "Nenhum imóvel cadastrado ainda." : "Nenhum imóvel encontrado."}
        </div>
      )}

      {/* Prévia flutuante de foto ao passar o mouse */}
      {hoverFoto && (
        <div style={{ position: "fixed", left: hoverFoto.x + 16, top: hoverFoto.y - 80, zIndex: 999, pointerEvents: "none", transition: "opacity 0.15s" }}>
          <img src={hoverFoto.src} alt="" style={{ width: 200, height: 150, objectFit: "cover", borderRadius: 10, boxShadow: "0 8px 30px rgba(0,0,0,0.3)", border: "2px solid var(--primary)" }} />
          <div style={{ background: "rgba(0,0,0,0.7)", color: "#fff", fontSize: 11, padding: "3px 8px", borderRadius: "0 0 8px 8px", textAlign: "center" }}>{hoverFoto.total} foto(s)</div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
        {filtered.map(im => (
          <div key={im.id}
            onMouseEnter={e => im.fotos?.[0] && setHoverFoto({ src: im.fotos[0], total: im.fotos.length, x: e.clientX, y: e.clientY })}
            onMouseMove={e => hoverFoto && setHoverFoto(h => ({ ...h, x: e.clientX, y: e.clientY }))}
            onMouseLeave={() => setHoverFoto(null)}>
          <ImovelCard
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
          </div>
        ))}
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
