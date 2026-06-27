import { useState } from "react";

export default function FotosGrid({ fotos, onChange, onRemove, onPrevia }) {
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const [lastDragEnd, setLastDragEnd] = useState(0);

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

  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 8px" }}>
        Arraste para reordenar · Clique na foto para ampliar. A primeira foto será a capa.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {fotos.map((f, i) => (
          <div
            key={f + "_" + i}
            data-idx={i}
            draggable
            onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDragIdx(i); }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOverIdx(i); }}
            onDragLeave={() => setOverIdx(null)}
            onDrop={(e) => { e.preventDefault(); handleDrop(i); }}
            onDragEnd={() => { setDragIdx(null); setOverIdx(null); setLastDragEnd(Date.now()); }}
            onClick={() => {
              // só abre prévia se não foi um drag (janela de 200ms)
              if (onPrevia && Date.now() - lastDragEnd > 200) onPrevia(f);
            }}
            style={{
              position: "relative",
              cursor: "grab",
              opacity: dragIdx === i ? 0.4 : 1,
              transform: overIdx === i && dragIdx !== i ? "scale(1.05)" : "scale(1)",
              transition: "transform 0.15s",
              userSelect: "none",
            }}>
            <img
              src={f}
              alt=""
              draggable={false}
              style={{
                width: 80, height: 80, objectFit: "cover", borderRadius: 8,
                border: i === 0 ? "2px solid var(--primary)" : "1px solid var(--border-soft)",
                display: "block", pointerEvents: "none",
              }}
            />
            {i === 0 && (
              <span style={{
                position: "absolute", bottom: 2, left: 2,
                background: "var(--primary)", color: "#fff", fontSize: 9,
                padding: "1px 5px", borderRadius: 4, fontWeight: 600,
                pointerEvents: "none"
              }}>CAPA</span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(i); }}
              style={{
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
