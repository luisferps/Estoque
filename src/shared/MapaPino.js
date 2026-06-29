import { useEffect, useRef, useState, useCallback } from "react";

// Backend (resolve links encurtados do Google Maps que não trazem a coordenada na URL)
const WA_AGENT_URL = "https://agentes-de-whatsapp-production.up.railway.app";

// Centro de Goiânia (fallback quando o imóvel ainda não tem coordenada)
const CENTRO_PADRAO = { lat: -16.6869, lng: -49.2648 };

// Carrega o Leaflet (CSS + JS) do CDN uma única vez.
let leafletPromise = null;
function carregarLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    // CSS
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    // JS
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("Falha ao carregar o mapa"));
    document.body.appendChild(script);
  });
  return leafletPromise;
}

// Extrai latitude/longitude de um link do Google Maps QUANDO a coordenada está
// visível na própria URL. Retorna null se for link encurtado (precisa do backend).
function coordDoLinkDireto(url) {
  if (!url) return null;
  try {
    // padrão @-16.18,-47.94,15z
    const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (at) return { lat: parseFloat(at[1]), lng: parseFloat(at[2]) };
    // padrão q=-16.18,-47.94 ou query=-16.18,-47.94 ou ll=-16.18,-47.94
    const q = url.match(/[?&](?:q|query|ll|destination)=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (q) return { lat: parseFloat(q[1]), lng: parseFloat(q[2]) };
    // padrão !3d-16.18!4d-47.94 (place URLs)
    const d3 = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (d3) return { lat: parseFloat(d3[1]), lng: parseFloat(d3[2]) };
  } catch { /* ignora */ }
  return null;
}

export default function MapaPino({ latitude, longitude, onChange }) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [link, setLink] = useState("");
  const [busca, setBusca] = useState("");
  const [resolvendo, setResolvendo] = useState(false);
  const [msg, setMsg] = useState("");

  const temCoord = latitude && longitude && !isNaN(parseFloat(latitude)) && !isNaN(parseFloat(longitude));
  const posInicial = temCoord
    ? { lat: parseFloat(latitude), lng: parseFloat(longitude) }
    : CENTRO_PADRAO;

  // Move o pino e avisa o Form (callback estável)
  const moverPino = useCallback((lat, lng, recentrar = true) => {
    const L = window.L;
    if (!L || !mapRef.current) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    }
    if (recentrar) mapRef.current.setView([lat, lng], 16);
    onChange(lat.toFixed(7), lng.toFixed(7));
  }, [onChange]);

  // Inicializa o mapa uma vez
  useEffect(() => {
    let cancelado = false;
    carregarLeaflet()
      .then((L) => {
        if (cancelado || !mapEl.current || mapRef.current) return;
        const map = L.map(mapEl.current).setView([posInicial.lat, posInicial.lng], temCoord ? 16 : 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap",
        }).addTo(map);

        const marker = L.marker([posInicial.lat, posInicial.lng], { draggable: true }).addTo(map);
        marker.on("dragend", () => {
          const p = marker.getLatLng();
          onChange(p.lat.toFixed(7), p.lng.toFixed(7));
        });
        // Clicar no mapa também move o pino
        map.on("click", (e) => {
          marker.setLatLng(e.latlng);
          onChange(e.latlng.lat.toFixed(7), e.latlng.lng.toFixed(7));
        });

        mapRef.current = map;
        markerRef.current = marker;
        setCarregando(false);
        // Corrige render do mapa dentro de containers que mudam de tamanho
        setTimeout(() => map.invalidateSize(), 200);
      })
      .catch(() => { if (!cancelado) { setErro("Não foi possível carregar o mapa."); setCarregando(false); } });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Se a coordenada mudar por fora (ex: colar no campo de texto), reposiciona o pino
  useEffect(() => {
    if (temCoord && markerRef.current && mapRef.current) {
      const lat = parseFloat(latitude), lng = parseFloat(longitude);
      const atual = markerRef.current.getLatLng();
      if (Math.abs(atual.lat - lat) > 1e-6 || Math.abs(atual.lng - lng) > 1e-6) {
        markerRef.current.setLatLng([lat, lng]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude]);

  // Aplica um link do Google Maps
  const aplicarLink = async () => {
    setMsg("");
    const url = link.trim();
    if (!url) return;

    // 1) Tenta extrair direto da URL
    const direto = coordDoLinkDireto(url);
    if (direto) {
      moverPino(direto.lat, direto.lng);
      setMsg("Pino posicionado pelo link ✓");
      return;
    }

    // 2) Link encurtado (maps.app.goo.gl) — pede ao backend pra resolver
    setResolvendo(true);
    try {
      const r = await fetch(`${WA_AGENT_URL}/geo/resolver-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const d = await r.json();
      if (d.ok && d.latitude && d.longitude) {
        moverPino(parseFloat(d.latitude), parseFloat(d.longitude));
        setMsg("Pino posicionado pelo link ✓");
      } else {
        setMsg(d.error || "Não consegui ler a coordenada desse link. Tente arrastar o pino.");
      }
    } catch {
      setMsg("Erro ao resolver o link. Tente arrastar o pino.");
    }
    setResolvendo(false);
  };

  // Busca por endereço (geocoder do backend)
  const buscarEndereco = async () => {
    setMsg("");
    const q = busca.trim();
    if (!q) return;
    setResolvendo(true);
    try {
      const r = await fetch(`${WA_AGENT_URL}/geo/buscar?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (d.ok && d.latitude && d.longitude) {
        moverPino(parseFloat(d.latitude), parseFloat(d.longitude));
        setMsg("Endereço encontrado ✓");
      } else {
        setMsg(d.error || "Endereço não encontrado. Tente ser mais específico ou arraste o pino.");
      }
    } catch {
      setMsg("Erro na busca. Tente arrastar o pino.");
    }
    setResolvendo(false);
  };

  return (
    <div>
      {/* Colar link do Google Maps */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aplicarLink(); } }}
          placeholder="Cole o link do Google Maps aqui"
          style={campo}
        />
        <button type="button" onClick={aplicarLink} disabled={resolvendo} style={btn}>
          {resolvendo ? "..." : "Aplicar link"}
        </button>
      </div>

      {/* Buscar por endereço */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscarEndereco(); } }}
          placeholder="Ou busque: rua, bairro, cidade"
          style={campo}
        />
        <button type="button" onClick={buscarEndereco} disabled={resolvendo} style={btn}>
          {resolvendo ? "..." : "Buscar"}
        </button>
      </div>

      {/* Mapa */}
      <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", border: "1px solid var(--border-soft)" }}>
        <div ref={mapEl} style={{ height: 300, width: "100%", background: "var(--bg-muted)" }} />
        {carregando && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
            Carregando mapa...
          </div>
        )}
        {erro && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#dc2626", fontSize: 13, padding: 12, textAlign: "center" }}>
            {erro}
          </div>
        )}
      </div>

      <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.5 }}>
        Arraste o pino (ou clique no mapa) para marcar o local exato. A coordenada é salva automaticamente e corrige o mapa no site e nos portais.
      </p>
      {msg && <p style={{ margin: "4px 0 0", fontSize: 12, color: msg.includes("✓") ? "#16a34a" : "#b45309" }}>{msg}</p>}

      {temCoord && (
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-soft)" }}>
          Coordenada atual: {parseFloat(latitude).toFixed(6)}, {parseFloat(longitude).toFixed(6)}
        </p>
      )}
    </div>
  );
}

const campo = { flex: "1 1 200px", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-input)", color: "var(--text)", fontSize: 13 };
const btn = { padding: "9px 16px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" };
