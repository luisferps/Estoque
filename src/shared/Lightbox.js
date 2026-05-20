import { useEffect } from "react";

export default function Lightbox({ idx, fotos, onClose, onChange }) {
  // Atalhos de teclado: ← → Esc
  useEffect(() => {
    if (idx === null || !fotos?.length) return;
    const handler = (e) => {
      if (e.key === "ArrowRight") onChange((idx + 1) % fotos.length);
      else if (e.key === "ArrowLeft") onChange((idx - 1 + fotos.length) % fotos.length);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [idx, fotos, onChange, onClose]);

  if (idx === null || !fotos?.length) return null;

  const prev = (e) => { e.stopPropagation(); onChange((idx - 1 + fotos.length) % fotos.length); };
  const next = (e) => { e.stopPropagation(); onChange((idx + 1) % fotos.length); };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.94)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <img src={fotos[idx]} alt="" style={{ maxWidth: "85vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 8 }} onClick={e => e.stopPropagation()} />
      {fotos.length > 1 && (
        <>
          <button onClick={prev} style={btnNav("left")}>‹</button>
          <button onClick={next} style={btnNav("right")}>›</button>
          <span style={{ position: "absolute", bottom: 16, color: "#fff", fontSize: 13, background: "rgba(0,0,0,0.5)", padding: "4px 12px", borderRadius: 20 }}>
            {idx + 1} / {fotos.length}
          </span>
        </>
      )}
      <button onClick={onClose} style={{ position: "absolute", top: 12, right: 16, background: "none", border: "none", color: "#fff", fontSize: 28, cursor: "pointer" }}>×</button>
    </div>
  );
}

const btnNav = (side) => ({
  position: "absolute", [side]: 12,
  background: "rgba(255,255,255,0.15)", border: "none", color: "#fff",
  fontSize: 30, borderRadius: "50%", width: 48, height: 48, cursor: "pointer"
});
