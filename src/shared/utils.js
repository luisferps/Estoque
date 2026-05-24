import { CLOUDINARY_CLOUD, CLOUDINARY_PRESET, RODAPE, PDF_CAMPOS } from "../constants";

// ─── Formatadores ───
export function formatBRL(v) {
  const n = parseFloat(v);
  if (!n) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function formatTel(v) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function telParaWhatsapp(tel) {
  if (!tel) return "";
  const d = tel.replace(/\D/g, "");
  return d.length >= 10 ? `55${d}` : "";
}

// ─── Helpers de imóvel ───
export const isLote = (im) => im?.tipo === "Lote" || im?.tipo === "Área";
// "Venda e Locação" é legado — tratado como Venda
export const isLocacao = (im) => im?.transacao === "Locação";
export const isVenda = (im) => im?.transacao === "Venda" || im?.transacao === "Venda e Locação";

export function statusDoImovel(im) {
  return im?.status || "Disponível"; // imóveis antigos sem status são tratados como Disponível
}

export function totalLocacao(im) {
  return (parseFloat(im?.valorAluguel) || 0) + (parseFloat(im?.valorCondominio) || 0) + (parseFloat(im?.valorIPTU) || 0);
}

// ─── Geração de descrição automática ───
export function gerarDescricao(form) {
  const isLoteForm = form.tipo === "Lote" || form.tipo === "Área";
  const linhas = [];
  if (form.titulo) linhas.push(form.titulo);
  linhas.push("");
  if (form.bairro) linhas.push(form.bairro.toUpperCase());
  linhas.push("");
  if (form.metragem) linhas.push(`- ${form.metragem} m² de construção`);
  if (form.metragemTotal) linhas.push(`- ${form.metragemTotal} m² de terreno`);
  const q = parseInt(form.quartos) || 0;
  const s = parseInt(form.suites) || 0;
  const g = parseInt(form.garagens) || 0;
  if (q > 0) linhas.push(`- ${q} quarto${q > 1 ? "s" : ""}${s > 0 ? `, sendo ${s} suíte${s > 1 ? "s" : ""}` : ""}`);
  else if (s > 0) linhas.push(`- ${s} suíte${s > 1 ? "s" : ""}`);
  if (g > 0) linhas.push(`- ${g} garagem${g > 1 ? "s" : ""}`);
  if (isLoteForm) {
    if (form.asfalto) linhas.push("- Asfalto");
    if (form.agua) linhas.push("- Água");
    if (form.esgoto) linhas.push("- Esgoto");
    if (form.declive === "Plano") linhas.push("- Plano");
    else if (form.declive) linhas.push(`- Declive: ${form.declive}`);
    if (form.muro) linhas.push("- Murado");
    if (form.esquina) linhas.push("- Esquina");
    if (form.retangular && form.frente && form.laterais) linhas.push(`- ${form.frente}x${form.laterais} m`);
    else if (form.medidas) linhas.push(`- ${form.medidas}`);
  }
  if (form.condominio && form.nomeCondominio) linhas.push(`- Condomínio: ${form.nomeCondominio}`);
  if (form.estadoImovel === "Imóvel Novo") linhas.push(`- ${form.estadoImovel}`);
  if (form.extras) linhas.push(...form.extras.split("\n").filter(Boolean).map(l => l.startsWith("-") ? l : `- ${l}`));
  linhas.push("");
  const loc = form.transacao === "Locação";
  const ven = form.transacao === "Venda" || form.transacao === "Venda e Locação";
  if (ven && parseFloat(form.preco)) {
    linhas.push(`Venda: ${formatBRL(form.preco)}`);
    if (parseFloat(form.valorAvaliacao)) linhas.push(`Avaliado em ${formatBRL(form.valorAvaliacao)}`);
    if (parseFloat(form.valorEntrada)) linhas.push(`Entrada: ${formatBRL(form.valorEntrada)}`);
  }
  if (loc) {
    const a = parseFloat(form.valorAluguel) || 0;
    const c = parseFloat(form.valorCondominio) || 0;
    const ip = parseFloat(form.valorIPTU) || 0;
    if (a) linhas.push(`Aluguel: ${formatBRL(a)}`);
    if (c) linhas.push(`Condomínio: ${formatBRL(c)}/mês`);
    if (ip) linhas.push(`IPTU: ${formatBRL(ip)}/mês`);
    const total = a + c + ip;
    if (total) linhas.push(`Total locação: ${formatBRL(total)}/mês`);
  }
  if (form.condicoes?.length) {
    const conds = form.condicoes.map(c => c === "Permuta" && form.permuta ? `Permuta (${form.permuta})` : c);
    linhas.push(conds.join(", "));
  }
  if (form.condominio && parseFloat(form.valorCondominioMensal)) linhas.push(`Condomínio: ${formatBRL(form.valorCondominioMensal)}/mês`);
  linhas.push("");
  linhas.push(RODAPE);
  return linhas.join("\n");
}

export function descricaoCompleta(im) {
  const desc = im.descricao || "";
  if (desc.includes(RODAPE)) return desc;
  return desc + (desc ? "\n\n" : "") + RODAPE;
}

// ─── Geração de PDF ───
export function gerarPDF(imoveis, camposSel, titulo = "Lista de Imóveis") {
  const COR_P = "#C0392B";
  const has = k => camposSel.includes(k);
  const lote = im => im.tipo === "Lote" || im.tipo === "Área";
  const rows = imoveis.map(im => {
    const total = (parseFloat(im.valorAluguel) || 0) + (parseFloat(im.valorCondominio) || 0) + (parseFloat(im.valorIPTU) || 0);
    return `<tr>
      ${has("tipo") ? `<td>${im.tipo || ""} / ${im.transacao || ""}</td>` : ""}
      ${has("status") ? `<td>${im.status || "Disponível"}</td>` : ""}
      ${has("cidade") ? `<td>${im.cidade || ""}</td>` : ""}
      ${has("bairro") ? `<td>${im.bairro || ""}</td>` : ""}
      ${has("maps") ? `<td>${im.mapsLink ? `<a href="${im.mapsLink}">Ver mapa</a>` : ""}</td>` : ""}
      ${has("metragem") ? `<td>${im.metragem ? im.metragem + " m²" : ""}</td>` : ""}
      ${has("terreno") ? `<td>${im.metragemTotal ? im.metragemTotal + " m²" : ""}</td>` : ""}
      ${has("quartos") ? `<td>${im.quartos || ""}</td>` : ""}
      ${has("suites") ? `<td>${im.suites || ""}</td>` : ""}
      ${has("garagens") ? `<td>${im.garagens || ""}</td>` : ""}
      ${has("asfalto") ? `<td>${lote(im) ? (im.asfalto ? "Sim" : "Não") : ""}</td>` : ""}
      ${has("agua") ? `<td>${lote(im) ? (im.agua ? "Sim" : "Não") : ""}</td>` : ""}
      ${has("esgoto") ? `<td>${lote(im) ? (im.esgoto ? "Sim" : "Não") : ""}</td>` : ""}
      ${has("muro") ? `<td>${lote(im) ? (im.muro ? "Sim" : "Não") : ""}</td>` : ""}
      ${has("medidas") ? `<td>${lote(im) ? (im.retangular && im.frente && im.laterais ? `${im.frente}x${im.laterais}m` : (im.medidas || "")) : ""}</td>` : ""}
      ${has("preco") ? `<td>${im.transacao === "Locação" ? (formatBRL(im.valorAluguel) || "") : (formatBRL(im.preco) || "")}</td>` : ""}
      ${has("condominio") ? `<td>${formatBRL(im.valorCondominio) || ""}</td>` : ""}
      ${has("iptu") ? `<td>${formatBRL(im.valorIPTU) || ""}</td>` : ""}
      ${has("total") ? `<td>${total > 0 ? formatBRL(total) : ""}</td>` : ""}
    </tr>`;
  }).join("");
  const headers = PDF_CAMPOS.filter(c => has(c.key)).map(c => `<th>${c.label}</th>`).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${titulo}</title>
  <style>body{font-family:Arial,sans-serif;font-size:10px;padding:16px}h2{color:${COR_P}}table{width:100%;border-collapse:collapse}th{background:${COR_P};color:#fff;padding:5px 7px;text-align:left;font-size:9px}td{border:1px solid #ddd;padding:4px 7px;vertical-align:top}tr:nth-child(even) td{background:#fdf5f5}a{color:${COR_P}}@media print{body{padding:0}@page{size:A4 landscape;margin:10mm}}</style>
  </head><body>
  <h2>${titulo}</h2><p style="color:#666;font-size:11px">Gerado em ${new Date().toLocaleDateString("pt-BR")} — ${imoveis.length} imóvel(is)</p>
  <table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
  const w = window.open("", "_blank");
  w.document.write(html); w.document.close();
  setTimeout(() => w.print(), 500);
}

// ─── Upload Cloudinary ───
export async function uploadToCloudinary(file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", CLOUDINARY_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: "POST", body: fd });
  const data = await res.json();
  if (!data.secure_url) throw new Error("Falha no upload");
  return data.secure_url;
}

// ─── ViaCEP ───
export function buscarCEP(raw, callback) {
  const c = raw.replace(/\D/g, "");
  if (c.length !== 8) return;
  const cbName = `cep_cb_${Date.now()}`;
  window[cbName] = (data) => {
    delete window[cbName];
    document.getElementById(cbName)?.remove();
    if (data && !data.erro) callback(data);
  };
  const s = document.createElement("script");
  s.id = cbName;
  s.src = `https://viacep.com.br/ws/${c}/json/?callback=${cbName}`;
  s.onerror = () => { delete window[cbName]; s.remove(); };
  document.head.appendChild(s);
}

// ─── Match de transação ───
export function matchTransacao(im, filtro) {
  if (filtro === "Todos") return true;
  // "Venda e Locação" legado conta como Venda
  if (im.transacao === "Venda e Locação") return filtro === "Venda";
  return im.transacao === filtro;
}

// ─── Ordenação ───
export function ordenarImoveis(imoveis, ordem) {
  const arr = [...imoveis];
  switch (ordem) {
    case "antigo":
      return arr.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    case "preco_menor":
      return arr.sort((a, b) => precoBase(a) - precoBase(b));
    case "preco_maior":
      return arr.sort((a, b) => precoBase(b) - precoBase(a));
    case "metragem_menor":
      return arr.sort((a, b) => metragemBase(a) - metragemBase(b));
    case "metragem_maior":
      return arr.sort((a, b) => metragemBase(b) - metragemBase(a));
    case "recente":
    default:
      return arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
}

function precoBase(im) {
  if (im.transacao === "Locação") return parseFloat(im.valorAluguel) || 0;
  return parseFloat(im.preco) || 0;
}

function metragemBase(im) {
  return parseFloat(im.metragem) || parseFloat(im.metragemTotal) || 0;
}

// ─── Download de fotos ───
export async function downloadFotos(im) {
  if (!im.fotos?.length) return alert("Sem fotos.");
  for (let i = 0; i < im.fotos.length; i++) {
    try {
      const res = await fetch(im.fotos[i]);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${im.titulo || "imovel"}_foto${i + 1}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
      await new Promise(r => setTimeout(r, 300));
    } catch {}
  }
}

// ─── WhatsApp ───
export function whatsappTudo(im) {
  const galeriaLink = `${window.location.origin}${window.location.pathname}#galeria-${im.id}`;
  const txt = descricaoCompleta(im) +
    (im.fotos?.length ? `\n\nFotos:\n${galeriaLink}` : "") +
    (im.mapsLink ? `\n\nLocalização:\n${im.mapsLink}` : "");
  window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
}

export function whatsappDescricao(im) {
  window.open("https://wa.me/?text=" + encodeURIComponent(descricaoCompleta(im)), "_blank");
}

export function whatsappMaps(im) {
  if (!im.mapsLink) return alert("Sem link do Maps.");
  window.open("https://wa.me/?text=" + encodeURIComponent(`Localização do imóvel:\n${im.mapsLink}`), "_blank");
}

export function whatsappFotos(im) {
  if (!im.fotos?.length) return alert("Sem fotos.");
  const link = `${window.location.origin}${window.location.pathname}#galeria-${im.id}`;
  window.open("https://wa.me/?text=" + encodeURIComponent(`Fotos do imóvel:\n${link}`), "_blank");
}

// ─── Link WhatsApp pra contato direto do cliente com a empresa ───
export function waContatoImovel(im, empresaWhatsapp) {
  const titulo = im.titulo || "imóvel";
  const link = `${window.location.origin}/imovel/${im.id}`;
  const msg = `Olá! Tenho interesse no imóvel: ${titulo}\n${link}`;
  return `https://wa.me/${empresaWhatsapp}?text=${encodeURIComponent(msg)}`;
}
