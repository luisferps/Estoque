import { useState, useRef } from "react";

export default function FotosGrid({ fotos, onChange, onRemove, onPrevia }) {
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  // touch drag
  const touchOrigin = useRef(null);

  if (!fotos?.length) return null;

  const handleDrop = (i) => {
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setOverIdx(null); return; }
    const arr = [...fotos];
    const [moved] = arr.splice(dragIdx, 1);
    arr.splice(i, 0, moved);
    onChange(arr);
    setDragIdx(null);
    setOverIdx(null);
  };

  // touch: identifica o card sob o dedo pelo elemento mais próximo com data-idx
  const idxFromTouch = (e) => {
    const t = e.changedTouches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const card = el && el.closest("[data-idx]");
    return card ? parseInt(card.getAttribute("data-idx"), 10) : null;
  };

  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 8px" }}>
        Arraste para reordenar. A primeira foto será a capa.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {fotos.map((f, i) => (
          <div
            key={f + "_" + i}
            data-idx={i}
            draggable
            onDragStart={() => setDragIdx(i)}
            onDragOver={(e) => { e.preventDefault(); setOverIdx(i); }}
            onDragLeave={() => setOverIdx(null)}
            onDrop={(e) => { e.preventDefault(); handleDrop(i); }}
            onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
            // touch events para mobile
            onTouchStart={() => { touchOrigin.current = i; setDragIdx(i); }}
            onTouchMove={(e) => { const t = idxFromTouch(e); if (t !== null) setOverIdx(t); }}
            onTouchEnd={(e) => {
              const t = idxFromTouch(e);
              if (t !== null) handleDrop(t);
              else { setDragIdx(null); setOverIdx(null); }
              touchOrigin.current = null;
            }}
            style={{
              position: "relative",
              cursor: "grab",
              opacity: dragIdx === i ? 0.4 : 1,
              transform: overIdx === i && dragIdx !== i ? "scale(1.05)" : "scale(1)",
              transition: "transform 0.15s",
              touchAction: "none",
            }}>
            <img src={f} alt=""
              onClick={e => { e.stopPropagation(); onPrevia && onPrevia(f); }}
              style={{
                width: 80, height: 80, objectFit: "cover", borderRadius: 8,
                border: i === 0 ? "2px solid var(--primary)" : "1px solid var(--border-soft)",
                display: "block", cursor: onPrevia ? "zoom-in" : "default",
                pointerEvents: onPrevia ? "auto" : "none"
              }} />
            {i === 0 && (
              <span style={{
                position: "absolute", bottom: 2, left: 2,
                background: "var(--primary)", color: "#fff", fontSize: 9,
                padding: "1px 5px", borderRadius: 4, fontWeight: 600,
                pointerEvents: "none"
              }}>CAPA</span>
            )}
            <button onClick={() => onRemove(i)} style={{
              position: "absolute", top: -7, right: -7,
              background: "var(--primary)", color: "#fff", border: "none",
              borderRadius: "50%", width: 22, height: 22, fontSize: 13,
              cursor: "pointer", lineHeight: 1
            }}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
