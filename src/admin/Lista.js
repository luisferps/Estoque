import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { excluirImovelBackend, editarImovelBackend } from "../shared/estoqueApi";
import { db } from "../firebase";
import { useImoveis, useTipos } from "../shared/hooks";
import { useUserRole, ehDiretorEfetivo, usuarioSSO } from "../shared/userRole";
import { matchTransacao, ordenarImoveis, statusDoImovel, reservarCodigoImovel, ajustarContadorMinimo, chaveBairro, descricaoPronta } from "../shared/utils";
import { btnPrimary, btnOutline, pageWrap } from "../shared/styles";
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
      (!q || (im.titulo || "").toLowerCase().includes(q) || (im.descricao || "").toLowerCase().includes(q) || (im.cidade || "").toLowerCase().includes(q) || (im.bairro || "").toLowerCase().includes(q))
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
    <div style={pageWrap(1100)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: "var(--primary-dark)" }}>
          Painel Admin — Imóveis ({filtered.length})
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <DarkModeToggle />
          <button onClick={() => navigate("/")} style={btnOutline}>Ver site público</button>
          <button onClick={() => navigate("/admin/consulta")} style={btnOutline}>Consulta</button>
          {ehDiretor && <>
            <button onClick={() => navigate("/admin/anuncios")} style={menuBtn}>Anúncios</button>
            <button onClick={() => navigate("/admin/rotacao")} style={menuBtnDestaque}>🏠 Rotação</button>
            <button onClick={() => navigate("/admin/destaques")} style={menuBtnDestaque}>⭐ Destaques</button>
            <button onClick={() => navigate("/admin/corretores")} style={menuBtn}>Corretores</button>
            <button onClick={() => navigate("/admin/importar")} style={menuBtn}>Importar</button>
            <button onClick={() => navigate("/admin/tipos")} style={menuBtn}>Tipos</button>
          </>}
          <span style={{ fontSize: 12, color: "var(--primary)", fontWeight: 500 }}>{ehDiretor ? "Diretor" : "Corretor"}</span>
          <button onClick={onLogout} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border-soft)", background: "var(--bg-card)", color: "var(--text)", cursor: "pointer" }}>Sair</button>
          <button onClick={() => navigate("/admin/novo")} style={btnPrimary}>+ Novo</button>
        </div>
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

const miniBtn = {
  flex: 1, padding: "6px 8px", fontSize: 12, borderRadius: 7,
  border: "1px solid var(--border-soft)", background: "var(--bg-muted)",
  color: "var(--text)", cursor: "pointer"
};

const menuBtn = {
  fontSize: 13, padding: "7px 14px", borderRadius: 8,
  border: "1px solid var(--border-soft)", background: "var(--bg-muted)",
  color: "var(--text-soft)", cursor: "pointer", fontWeight: 500
};

const menuBtnDestaque = {
  fontSize: 13, padding: "7px 14px", borderRadius: 8,
  border: "1px solid var(--primary)", background: "var(--primary-light)",
  color: "var(--primary-dark)", cursor: "pointer", fontWeight: 600
};
