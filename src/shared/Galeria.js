import { useState } from "react";
import { useImoveis } from "./hooks";
import Lightbox from "./Lightbox";

export default function Galeria({ id }) {
  const { imoveis } = useImoveis();
  const [lb, setLb] = useState(null);
  const im = imoveis.find(i => i.id === id);

  return (
    <div style={{ fontFamily: "sans-serif", background: "#111", minHeight: "100vh", padding: "1rem" }}>
      <Lightbox idx={lb} fotos={im?.fotos || []} onClose={() => setLb(null)} onChange={setLb} />
      <h2 style={{ margin: "0 0 1rem", fontSize: 18, fontWeight: 500, color: "#fff" }}>
        {im?.titulo || "Fotos do imóvel"}
      </h2>
      {im?.fotos?.length > 0 ? (
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
