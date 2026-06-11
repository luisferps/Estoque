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
    <div style={{ fontFamily: "sans-serif", background: "#111", minHeight: "100vh", padding: "1rem" }}>
      <Lightbox idx={lb} fotos={im?.fotos || []} onClose={() => setLb(null)} onChange={setLb} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "0 0 1rem" }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: "#fff", flex: 1 }}>
          {im?.titulo || "Fotos do imóvel"}
        </h2>
        {temFotos && (
          <button onClick={baixarTodas} disabled={baixando}
            style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: baixando ? "#555" : "#25D366", color: "#fff", fontSize: 14, fontWeight: 600, cursor: baixando ? "default" : "pointer" }}>
            {baixando ? "Baixando..." : `⬇️ Baixar todas (${im.fotos.length})`}
          </button>
        )}
      </div>
      {temFotos ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
          {im.fotos.map((f, i) => (
            <img key={i} src={f} alt="" onClick={() => setLb(i)}
              style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8, cursor: "zoom-in" }} />
          ))}
        </div>
      ) : (
        <p style={{ color: "#888", textAlign: "center", padding: "4rem 0" }}>Nenhuma foto encontrada.</p>
      )}
    </div>
  );
}
