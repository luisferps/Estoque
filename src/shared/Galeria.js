import { useState } from "react";
import { useImoveis } from "./hooks";
import { downloadFotos } from "./utils";
import Lightbox from "./Lightbox";

export default function Galeria({ id }) {
  const { imoveis } = useImoveis();
  const [lb, setLb] = useState(null);
  const [baixando, setBaixando] = useState(false);
  const im = imoveis.find(i => i.id === id);
  const temFotos = im?.fotos?.length > 0;

  const baixarTodas = async () => {
    if (!temFotos || baixando) return;
    setBaixando(true);
    try { await downloadFotos(im); } catch {}
    setBaixando(false);
  };

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", background: "#0e0e10", minHeight: "100vh", padding: "1.25rem", color: "#f4f4f5" }}>
      {/* fonte global pra ficar igual ao resto do site */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`.gal-btn:hover { filter: brightness(1.06); }`}</style>

      <Lightbox idx={lb} fotos={im?.fotos || []} onClose={() => setLb(null)} onChange={setLb} />

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "0 auto 1.2rem", maxWidth: 1200 }}>
        <h2 style={{ margin: 0, fontFamily: "Manrope, sans-serif", fontSize: 22, fontWeight: 800, color: "#fff", flex: 1, letterSpacing: -0.4 }}>
          {im?.titulo || "Fotos do imóvel"}
        </h2>
        {temFotos && (
          <button onClick={baixarTodas} disabled={baixando} className="gal-btn"
            style={{
              padding: "11px 20px", borderRadius: 14, border: "none",
              background: baixando ? "#3a3a40" : "linear-gradient(135deg, #25D366 0%, #128C7E 100%)",
              color: "#fff", fontSize: 14.5, fontWeight: 700, cursor: baixando ? "default" : "pointer",
              boxShadow: baixando ? "none" : "0 8px 20px rgba(37,211,102,0.30)"
            }}>
            {baixando ? "Baixando..." : `⬇️ Baixar todas (${im.fotos.length})`}
          </button>
        )}
      </div>

      {temFotos ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10, maxWidth: 1200, margin: "0 auto" }}>
          {im.fotos.map((f, i) => (
            <img key={i} src={f} alt="" onClick={() => setLb(i)}
              style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 14, cursor: "zoom-in", border: "1px solid rgba(255,255,255,0.08)" }} />
          ))}
        </div>
      ) : (
        <p style={{ color: "#9a9aa3", textAlign: "center", padding: "4rem 0" }}>Nenhuma foto encontrada.</p>
      )}
    </div>
  );
}
