import { CLOUDINARY_CLOUD, CLOUDINARY_PRESET, RODAPE, PDF_CAMPOS } from "../constants";
import { runTransaction, doc } from "firebase/firestore";

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
export const isLote = (im) => tipoEhLotePorNome(im?.tipo);

export function comportamentoTipo(nomeTipo, tipos) {
  const t = (tipos || []).find(x => x.nome === nomeTipo);
  if (t?.comportamento) return t.comportamento;
  // Fallback por palavra-chave no nome (pega "Lote Comercial", "Lote em Condomínio", "Terreno Comercial" etc.)
  const n = String(nomeTipo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.includes("lote") || n.includes("terreno") || n.includes("gleba") || n.includes("loteamento") || /\barea\b/.test(n)) return "terreno";
  if (n.includes("casa") || n.includes("apartamento") || n.includes("sobrado") || n.includes("cobertura") || n.includes("kitnet") || n.includes("studio") || n.includes("flat") || n.includes("loft")) return "construcao";
  return "simples";
}
export const ehTerreno = (nomeTipo, tipos) => comportamentoTipo(nomeTipo, tipos) === "terreno";
export const ehConstrucao = (nomeTipo, tipos) => comportamentoTipo(nomeTipo, tipos) === "construcao";
export const isLocacao = (im) => im?.transacao === "Locação";
export const isVenda = (im) => im?.transacao === "Venda" || im?.transacao === "Venda e Locação";

export function statusDoImovel(im) {
  return im?.status || "Disponível";
}

// Visibilidade no site público. O campo "visibilidade" pode ocultar o imóvel
// do site mesmo estando Disponível. "Ocultar do site" e "Ocultar de tudo"
// removem da vitrine pública; os demais valores (ou vazio) mantêm visível.
export function apareceNoSite(im) {
  const v = (im?.visibilidade || "").trim();
  return v !== "Ocultar do site" && v !== "Ocultar de tudo";
}

// Visibilidade nos PORTAIS (feeds Canal Pro / Chaves na Mão / Catálogo Meta).
// Espelha apareceNoSite, mas pro lado dos portais: "Ocultar dos portais" mantém
// o imóvel no site e o tira dos feeds; "Ocultar de tudo" tira de tudo. Os demais
// valores (ou vazio) mantêm o imóvel nos feeds dos portais.
export function apareceNosPortais(im) {
  const v = (im?.visibilidade || "").trim();
  return v !== "Ocultar dos portais" && v !== "Ocultar de tudo";
}

export function totalLocacao(im) {
  return (parseFloat(im?.valorAluguel) || 0) + (parseFloat(im?.valorCondominio) || 0) + (parseFloat(im?.valorIPTU) || 0);
}

// ─── Código do imóvel (baseado no bairro/setor, com numeração) ───
// Regra: o código padrão é o nome do bairro. Se já houver imóvel(is) com código
// daquele bairro, numera os próximos (primeiro sem número, depois " 2", " 3"...).
// Ex: "Rosa dos Ventos", "Rosa dos Ventos 2", "Rosa dos Ventos 3".
// - bairro: nome do bairro do imóvel atual
// - imoveis: lista completa de imóveis (para contar quantos já têm código do bairro)
// - idAtual: id do imóvel sendo editado (ignora ele mesmo na contagem)
export function gerarCodigoImovel(bairro, imoveis, idAtual) {
  const base = (bairro || "").trim();
  if (!base) return "";
  // Regex que casa "Bairro" ou "Bairro N" (com espaço e número no fim)
  const escapar = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("^" + escapar + "(?:\\s+(\\d+))?$", "i");
  let maior = 0;          // maior número já usado naquele bairro
  let temBase = false;    // se já existe o código sem número (o "1" implícito)
  for (const im of (imoveis || [])) {
    if (idAtual && im.id === idAtual) continue; // ignora o próprio
    const cod = (im.codigo || "").trim();
    if (!cod) continue;
    const m = cod.match(re);
    if (!m) continue;
    if (m[1]) { const n = parseInt(m[1], 10); if (n > maior) maior = n; }
    else { temBase = true; }
  }
  if (!temBase && maior === 0) return base;        // primeiro do bairro
  const proximo = Math.max(maior, temBase ? 1 : 0) + 1;
  return `${base} ${proximo}`;
}

// Normaliza o nome do bairro para usar como ID do documento de contador.
// (minúsculas, sem acento, espaços colapsados). Ex: "Rosa dos Ventos" -> "rosa dos ventos"
export function chaveBairro(bairro) {
  return (bairro || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

// Reserva (de forma ATÔMICA) o próximo código para um bairro, usando um contador
// persistente no Firestore (coleção "contadores"). O contador só CRESCE — nunca
// reutiliza número, mesmo que imóveis sejam excluídos. Garante unicidade global.
// Primeiro do bairro = só "{Bairro}"; demais = "{Bairro} N".
// - db: instância do Firestore
// - bairro: nome do bairro (mantém capitalização original no código final)
// Retorna o código string (ex: "Rosa dos Ventos" ou "Rosa dos Ventos 4").
export async function reservarCodigoImovel(db, bairro) {
  const base = (bairro || "").trim();
  if (!base) return "";
  const chave = chaveBairro(base);
  const ref = doc(db, "contadores", chave);
  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const atual = snap.exists() ? (snap.data().seq || 0) : 0;
    const novo = atual + 1;
    tx.set(ref, { seq: novo, bairro: base }, { merge: true });
    return novo;
  });
  return seq <= 1 ? base : `${base} ${seq}`;
}

// Inicializa o contador de um bairro com um valor mínimo (usado na migração,
// para que os contadores reflitam os códigos já existentes). Só aumenta, nunca diminui.
export async function ajustarContadorMinimo(db, bairro, minimo) {
  const base = (bairro || "").trim();
  if (!base || !minimo) return;
  const ref = doc(db, "contadores", chaveBairro(base));
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const atual = snap.exists() ? (snap.data().seq || 0) : 0;
    if (minimo > atual) tx.set(ref, { seq: minimo, bairro: base }, { merge: true });
  });
}

// ─── Geração de descrição automática ───
// Reconhece tipos de lote/terreno pelo NOME — pega "Lote em Condomínio",
// "Lote Comercial", "Área Comercial", "Terreno" etc., não só "Lote"/"Área".
export function tipoEhLotePorNome(tipo) {
  return /lote|terreno|gleba|loteamento|[aá]rea/.test((tipo || "").toLowerCase());
}

export function gerarDescricao(form) {
  const isLoteForm = tipoEhLotePorNome(form.tipo);
  const isRuralForm = /ch[áa]cara|s[íi]tio|fazenda|rancho|haras/i.test(form.tipo || "");
  const linhas = [];
  if (form.titulo) linhas.push(form.titulo);
  linhas.push("");
  if (form.bairro) linhas.push(form.bairro.toUpperCase());
  linhas.push("");
  if (form.metragem) linhas.push(`- ${form.metragem} m² de construção`);
  if (form.metragemTotal) linhas.push(`- ${form.metragemTotal} m² de terreno`);
  // medidas/dimensões do lote logo abaixo da metragem
  if (form.retangular && form.frente && form.laterais) linhas.push(`- ${form.frente}x${form.laterais} m`);
  else if (form.medidas) linhas.push(`- ${form.medidas}`);
  const q = parseInt(form.quartos) || 0;
  const s = parseInt(form.suites) || 0;
  const g = parseInt(form.garagens) || 0;
  if (q > 0) linhas.push(`- ${q} quarto${q > 1 ? "s" : ""}${s > 0 ? `, sendo ${s} suíte${s > 1 ? "s" : ""}` : ""}`);
  else if (s > 0) linhas.push(`- ${s} suíte${s > 1 ? "s" : ""}`);
  if (g > 0) linhas.push(`- ${g} ${g > 1 ? "garagens" : "garagem"}`);
  if (isLoteForm || isRuralForm) {
    if (form.asfalto) linhas.push("- Asfalto");
    if (form.agua) linhas.push("- Água");
    if (form.esgoto) linhas.push("- Esgoto");
    if (form.declive === "Plano") linhas.push("- Plano");
    else if (form.declive) linhas.push(`- Declive: ${form.declive}`);
    if (form.muro) linhas.push("- Murado");
    if (form.esquina) linhas.push("- Esquina");
  }
  if (form.condominio && form.nomeCondominio) linhas.push(`- Condomínio: ${form.nomeCondominio}`);
  if (form.estadoImovel === "Imóvel Novo") linhas.push(`- ${form.estadoImovel}`);
  if (form.extras) {
    // não repetir o valor de venda: extras às vezes traz "Venda: R$..." ou "R$ ..." (já sai abaixo)
    const ehLinhaPreco = (l) => /^-?\s*(venda|[áa]gio|valor de venda|pre[çc]o)\b/i.test(l) || /^-?\s*r\$\s*\d/i.test(l);
    linhas.push(...form.extras.split("\n").map(x => x.trim()).filter(Boolean).filter(l => !ehLinhaPreco(l)).map(l => l.startsWith("-") ? l : `- ${l}`));
  }
  linhas.push("");
  const loc = form.transacao === "Locação";
  const ven = form.transacao === "Venda" || form.transacao === "Venda e Locação";
  if (ven && parseFloat(form.preco)) {
    // Ágio: troca o rótulo "Venda" por "Ágio" (imóvel financiado/em consórcio).
    const rotuloVenda = form._agio ? "Ágio" : "Venda";
    linhas.push(`${rotuloVenda}: ${formatBRL(form.preco)}`);
    // Dados do ágio: parcela, prazo, saldo devedor e valor total (ágio + saldo).
    if (form._agio) {
      if (parseFloat(form.agioParcela)) linhas.push(`Parcelas de ${formatBRL(form.agioParcela)}`);
      if (parseFloat(form.agioPrazo)) linhas.push(`Faltam ${parseInt(form.agioPrazo)} meses para quitação`);
      if (parseFloat(form.agioSaldoDevedor)) linhas.push(`Saldo devedor: ${formatBRL(form.agioSaldoDevedor)}`);
      const totalAgio = (parseFloat(form.preco) || 0) + (parseFloat(form.agioSaldoDevedor) || 0);
      if (totalAgio) linhas.push(`Valor total: ${formatBRL(totalAgio)}`);
    }
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
    // "À vista" é óbvio, não entra. Prefixo "Aceita ..." e em minúsculo.
    const conds = form.condicoes
      .filter(c => c !== "À vista")
      .map(c => c === "Permuta" && String(form.permuta || "").trim() ? `permuta em ${String(form.permuta).trim()}` : String(c).toLowerCase());
    if (conds.length) linhas.push(`Aceita ${conds.join(", ")}`);
  }
  if (form.condominio && parseFloat(form.valorCondominioMensal)) linhas.push(`Condomínio: ${formatBRL(form.valorCondominioMensal)}/mês`);
  linhas.push("");
  linhas.push(RODAPE);
  return linhas.join("\n");
}

export function temRodape(desc) {
  if (!desc) return false;
  return /valores e condi[çc][õo]es/i.test(desc);
}

export function descricaoCompleta(im) {
  const desc = im.descricao || "";
  if (temRodape(desc)) return desc;
  return desc + (desc ? "\n\n" : "") + RODAPE;
}

export function descricaoPronta(im) {
  let txt = descricaoCompleta(im);
  if (im.fotos?.length) {
    const ref = encodeURIComponent((im.codigo || "").trim() || String(im.id));
    const galeria = `https://inerente.com.br/fotos/${ref}`;
    txt += `\n\nFotos:\n${galeria}`;
  }

  if (im.mapsLink) txt += `\n\nLocalização:\n${im.mapsLink}`;
  return txt;
}

// ─── Geração de PDF ───
export function gerarPDF(imoveis, camposSel, titulo = "Lista de Imóveis") {
  const COR_P = "#C0392B";
  const lote = im => tipoEhLotePorNome(im.tipo);
  const isLoc = im => (im.transacao || "").includes("Locação");
  const isVen = im => (im.transacao || "").includes("Venda");

  // Ficha completa para imóvel único; tabela para múltiplos
  const fichaUnica = imoveis.length === 1;

  const fichaHtml = (im) => {
    const fotos = (im.fotos || []).filter(Boolean);
    const fotosHtml = fotos.length ? `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:12px 0;page-break-inside:avoid">
        ${fotos.map((f, i) => `<img src="${f}" style="width:100%;height:140px;object-fit:cover;border-radius:6px;${i===0?'grid-column:span 3;height:240px':''}" />`).join("")}
      </div>` : "";

    const row = (l, v) => v ? `<tr><td style="color:#888;font-size:11px;width:140px;padding:4px 8px">${l}</td><td style="font-size:12px;font-weight:600;padding:4px 8px">${v}</td></tr>` : "";
    const total = (parseFloat(im.valorAluguel)||0)+(parseFloat(im.valorCondominio)||0)+(parseFloat(im.valorIPTU)||0);

    return `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;border-bottom:2px solid ${COR_P};padding-bottom:12px">
          <div>
            <h1 style="margin:0;font-size:20px;color:${COR_P}">${im.titulo || im.tipo || "Imóvel"}</h1>
            ${im.bairro || im.cidade ? `<p style="margin:4px 0 0;font-size:13px;color:#666">${[im.bairro,im.cidade].filter(Boolean).join(", ")}</p>` : ""}
          </div>
          ${im.codigo ? `<span style="font-size:12px;font-weight:700;color:${COR_P};border:1px solid ${COR_P};padding:4px 10px;border-radius:6px">CÓD: ${String(im.codigo).toUpperCase()}</span>` : ""}
        </div>

        ${fotosHtml}

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px">
          <div>
            <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:${COR_P};text-transform:uppercase;letter-spacing:0.5px">Características</p>
            <table style="width:100%;border-collapse:collapse">
              ${row("Tipo", im.tipo)}
              ${row("Transação", im.transacao)}
              ${row("Estado", im.estadoImovel)}
              ${row("Metragem", im.metragem ? im.metragem+" m²" : null)}
              ${row("Terreno", im.metragemTotal ? im.metragemTotal+" m²" : null)}
              ${!lote(im) ? row("Quartos", im.quartos) : ""}
              ${!lote(im) ? row("Suítes", im.suites) : ""}
              ${!lote(im) ? row("Banheiros", im.banheiros) : ""}
              ${row("Garagens", im.garagens)}
              ${lote(im) ? row("Asfalto", im.asfalto ? "Sim" : null) : ""}
              ${lote(im) ? row("Água", im.agua ? "Sim" : null) : ""}
              ${lote(im) ? row("Esgoto", im.esgoto ? "Sim" : null) : ""}
              ${lote(im) ? row("Muro", im.muro ? "Sim" : null) : ""}
              ${lote(im) && im.retangular && im.frente && im.laterais ? row("Medidas", `${im.frente}x${im.laterais}m`) : ""}
            </table>
          </div>
          <div>
            <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:${COR_P};text-transform:uppercase;letter-spacing:0.5px">Valores</p>
            <table style="width:100%;border-collapse:collapse">
              ${isVen(im) ? row("Preço de venda", formatBRL(im.preco)) : ""}
              ${isLoc(im) ? row("Aluguel", formatBRL(im.valorAluguel)) : ""}
              ${row("Condomínio", formatBRL(im.valorCondominio))}
              ${row("IPTU", formatBRL(im.valorIPTU))}
              ${total > 0 && isLoc(im) ? row("Total/mês", formatBRL(total)) : ""}
              ${row("Avaliação", formatBRL(im.valorAvaliacao))}
              ${row("Entrada", formatBRL(im.valorEntrada))}
            </table>
            ${im.mapsLink ? `<a href="${im.mapsLink}" style="display:inline-block;margin-top:12px;font-size:12px;color:${COR_P}">📍 Ver no Google Maps</a>` : ""}
          </div>
        </div>

        ${im.descricao ? `
        <div style="margin-top:16px;page-break-inside:avoid">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:${COR_P};text-transform:uppercase;letter-spacing:0.5px">Descrição</p>
          <p style="font-size:12px;color:#444;line-height:1.6;white-space:pre-wrap">${im.descricao}</p>
        </div>` : ""}

        <div style="margin-top:20px;padding-top:12px;border-top:1px solid #eee;font-size:10px;color:#aaa;text-align:center">
          Inerente Gestão Imobiliária — gerado em ${new Date().toLocaleDateString("pt-BR")}
        </div>
      </div>`;
  };

  // Para múltiplos imóveis, mantém tabela compacta
  const tabelaHtml = () => {
    const has = k => camposSel.includes(k);
    const rows = imoveis.map(im => {
      const total = (parseFloat(im.valorAluguel)||0)+(parseFloat(im.valorCondominio)||0)+(parseFloat(im.valorIPTU)||0);
      return `<tr>
        ${has("tipo") ? `<td>${im.tipo||""} / ${im.transacao||""}</td>` : ""}
        ${has("status") ? `<td>${im.status||"Disponível"}</td>` : ""}
        ${has("cidade") ? `<td>${im.cidade||""}</td>` : ""}
        ${has("bairro") ? `<td>${im.bairro||""}</td>` : ""}
        ${has("metragem") ? `<td>${im.metragem ? im.metragem+" m²" : ""}</td>` : ""}
        ${has("quartos") ? `<td>${im.quartos||""}</td>` : ""}
        ${has("preco") ? `<td>${isLoc(im) ? (formatBRL(im.valorAluguel)||"") : (formatBRL(im.preco)||"")}</td>` : ""}
        ${has("total") ? `<td>${total > 0 ? formatBRL(total) : ""}</td>` : ""}
      </tr>`;
    }).join("");
    const headers = PDF_CAMPOS.filter(c => has(c.key)).map(c => `<th>${c.label}</th>`).join("");
    return `<h2 style="color:${COR_P}">${titulo}</h2>
      <p style="color:#666;font-size:11px">${imoveis.length} imóvel(is) — ${new Date().toLocaleDateString("pt-BR")}</p>
      <table style="width:100%;border-collapse:collapse;font-size:10px">
        <thead><tr style="background:${COR_P};color:#fff">${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  };

  const bodyHtml = fichaUnica ? fichaHtml(imoveis[0]) : tabelaHtml();
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${titulo}</title>
  <style>
    body{margin:0;padding:0;font-family:Arial,sans-serif}
    table td,table th{border:1px solid #eee;vertical-align:top}
    tr:nth-child(even) td{background:#fdf5f5}
    @media print{body{padding:0}@page{size:A4;margin:10mm}}
  </style>
  </head><body>${bodyHtml}</body></html>`;

  const w = window.open("", "_blank");
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 800);
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
// Retorna: logradouro, complemento, bairro, localidade, uf
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

// ─── Geocoding via OpenStreetMap Nominatim ───
// Busca latitude/longitude a partir do endereço do imóvel.
// Gratuito, sem API key. Suficiente para uso manual (1 req por save).
// Retorna { latitude, longitude } como strings ou null se não encontrar.
export async function geocodificarEndereco({ endereco, bairro, cidade, estado, cep }) {
  try {
    const partes = [endereco, bairro, cidade, estado, "Brasil"].filter(Boolean);
    const q = encodeURIComponent(partes.join(", "));
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=br`,
      { headers: { "Accept-Language": "pt-BR" } }
    );
    const data = await res.json();
    if (data && data.length > 0) {
      return {
        latitude: parseFloat(data[0].lat).toFixed(7),
        longitude: parseFloat(data[0].lon).toFixed(7),
      };
    }
    // Fallback: tenta só cidade + estado
    if (cidade) {
      const q2 = encodeURIComponent(`${cidade}, ${estado || ""}, Brasil`);
      const res2 = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${q2}&format=json&limit=1&countrycodes=br`,
        { headers: { "Accept-Language": "pt-BR" } }
      );
      const data2 = await res2.json();
      if (data2 && data2.length > 0) {
        return {
          latitude: parseFloat(data2[0].lat).toFixed(7),
          longitude: parseFloat(data2[0].lon).toFixed(7),
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Match de transação ───
export function matchTransacao(im, filtro) {
  if (filtro === "Todos") return true;
  if (im.transacao === "Venda e Locação") return filtro === "Venda";
  return im.transacao === filtro;
}

// ─── Ordenação ───
export function ordenarImoveis(imoveis, ordem) {
  const arr = [...imoveis];
  switch (ordem) {
    case "antigo": return arr.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    case "preco_menor": return arr.sort((a, b) => precoBase(a) - precoBase(b));
    case "preco_maior": return arr.sort((a, b) => precoBase(b) - precoBase(a));
    case "metragem_menor": return arr.sort((a, b) => metragemBase(a) - metragemBase(b));
    case "metragem_maior": return arr.sort((a, b) => metragemBase(b) - metragemBase(a));
    case "bairro_az": return arr.sort((a, b) => bairroBase(a).localeCompare(bairroBase(b), "pt-BR"));
    case "bairro_za": return arr.sort((a, b) => bairroBase(b).localeCompare(bairroBase(a), "pt-BR"));
    case "recente":
    default: return arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
}

function precoBase(im) {
  if (im.transacao === "Locação") return parseFloat(im.valorAluguel) || 0;
  return parseFloat(im.preco) || 0;
}

function metragemBase(im) {
  return parseFloat(im.metragem) || parseFloat(im.metragemTotal) || 0;
}

// Bairro normalizado para ordenação. Vazios vão pro fim (caractere alto)
// para não aparecerem antes dos preenchidos na ordem A-Z.
function bairroBase(im) {
  const b = (im.bairro || "").trim();
  return b ? b.toLocaleLowerCase("pt-BR") : "\uffff";
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
  const ref = encodeURIComponent((im.codigo || "").trim() || String(im.id));
  const galeriaLink = `https://inerente.com.br/fotos/${ref}`;
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

export function waContatoImovel(im, empresaWhatsapp) {
  const titulo = im.titulo || "imóvel";
  const link = `${window.location.origin}/imovel/${im.id}`;
  const msg = `Olá! Tenho interesse no imóvel: ${titulo}\n${link}`;
  return `https://wa.me/${empresaWhatsapp}?text=${encodeURIComponent(msg)}`;
}

// ─── Validação para feeds automáticos ───
// Os feeds mapeiam QUALQUER tipo (via comportamento do cadastro central), então
// não existe mais "tipo não suportado": o que importa é o tipo estar preenchido.
const TIPOS_TERRENO_VALIDACAO = ["Lote","Terreno","Área","Sítio","Chácara","Fazenda","Galpão","Depósito"];

// Canais com integração automática via feed XML
export const CANAIS_AUTO = ["Canal Pro", "Chaves na Mão", "Catálogo Meta"];

// Valida se um imóvel atende aos requisitos do canal automático.
// Retorna array de strings com os problemas (vazio = OK).
// Para canais manuais, sempre retorna [].
export function validarParaCanal(im, canal) {
  if (!CANAIS_AUTO.includes(canal)) return [];

  const problemas = [];
  const status = (im.status || "").toLowerCase();
  if (status && status !== "disponível" && status !== "disponivel") {
    problemas.push("Status não está como Disponível");
  }

  // Visibilidade: "Ocultar dos portais" e "Ocultar de tudo" tiram o imóvel dos feeds.
  if (!apareceNosPortais(im)) {
    problemas.push("Visibilidade está ocultando dos portais");
  }

  // Canal desligado de propósito (opt-out explícito ativo:false).
  if (im.anuncios && im.anuncios[canal] && im.anuncios[canal].ativo === false) {
    problemas.push('Canal desligado à mão em "Onde foi anunciado" (remarque para voltar ao feed)');
  }

  const fotos = (im.fotos || []).filter(Boolean);
  const desc = (im.descricao || "").trim();
  const cidade = (im.cidade || "").trim();
  const bairro = (im.bairro || "").trim();
  const estado = (im.estado || "").trim();
  const trans = im.transacao || "";
  const isLocacao = trans === "Locação";
  const isVenda = trans === "Venda" || trans === "Venda e Locação";
  const isLote = TIPOS_TERRENO_VALIDACAO.includes(im.tipo);
  const metragem = parseFloat(im.metragem) || 0;
  const metragemTotal = parseFloat(im.metragemTotal) || 0;
  const area = isLote ? (metragemTotal || metragem) : (metragem || metragemTotal);

  if (!im.tipo) problemas.push("Defina o tipo do imóvel");

  // BLOQUEIOS REAIS: o que de fato IMPEDE o anúncio de subir no portal.
  // (CEP e quartos/banheiros NÃO entram aqui — o feed XML os preenche
  //  automaticamente, então não impedem a publicação. Viram aviso de qualidade
  //  em avisosDoCanal().)
  if (canal === "Canal Pro") {
    if (fotos.length === 0) problemas.push("Adicione pelo menos 1 foto");
    if (desc.length < 50) problemas.push("Descrição precisa ter no mínimo 50 caracteres");
    if (area === 0) problemas.push("Preencha a metragem");
    if (!cidade) problemas.push("Preencha a cidade");
    if (!bairro) problemas.push("Preencha o bairro");
    if (isVenda && !parseFloat(im.preco) && !parseFloat(im.valorFinal)) problemas.push("Preencha o preço de venda");
    if (isLocacao && !parseFloat(im.valorAluguel)) problemas.push("Preencha o valor do aluguel");
    if (!isVenda && !isLocacao) problemas.push("Defina o tipo de transação");
  }

  if (canal === "Chaves na Mão") {
    if (!cidade) problemas.push("Preencha a cidade (o Chaves recusa sem cidade)");
    if (!bairro) problemas.push("Preencha o bairro (o Chaves recusa sem bairro)");
    if (!estado) problemas.push("Preencha o estado (UF)");
    if (!desc) problemas.push("Preencha a descrição");
    if (isVenda && !parseFloat(im.preco) && !parseFloat(im.valorFinal)) problemas.push("Preencha o preço de venda");
    if (isLocacao && !parseFloat(im.valorAluguel)) problemas.push("Preencha o valor do aluguel");
    if (!isVenda && !isLocacao) problemas.push("Defina o tipo de transação");
  }

  if (canal === "Catálogo Meta") {
    if (fotos.length === 0) problemas.push("Adicione pelo menos 1 foto");
    if (!cidade) problemas.push("Preencha a cidade");
    if (!estado) problemas.push("Preencha o estado (UF)");
    if (!parseFloat(im.latitude) || !parseFloat(im.longitude)) problemas.push("Coordenadas não foram encontradas — verifique cidade/bairro");
    if (isVenda && !parseFloat(im.preco) && !parseFloat(im.valorFinal)) problemas.push("Preencha o preço de venda");
    if (isLocacao && !parseFloat(im.valorAluguel)) problemas.push("Preencha o valor do aluguel");
    if (!isVenda && !isLocacao) problemas.push("Defina o tipo de transação");
  }

  return problemas;
}

// Avisos de QUALIDADE — não impedem o anúncio de subir (o feed conserta sozinho),
// mas o portal reclama e baixa a nota. Aparecem na fila como campos pra preencher.
export function avisosDoCanal(im, canal) {
  if (!CANAIS_AUTO.includes(canal)) return [];
  const avisos = [];
  const isLote = TIPOS_TERRENO_VALIDACAO.includes(im.tipo);

  // CEP: o feed preenche com o CEP da cidade quando vazio/inválido, mas o ZAP+
  // dá nota menor. Avisar para melhorar (não bloqueia).
  if (canal === "Canal Pro" || canal === "Chaves na Mão") {
    const cepLimpo = String(im.cep || "").replace(/\D/g, "");
    if (!cepLimpo) avisos.push("CEP vazio — o feed usa o CEP da cidade, mas o ideal é preencher o exato");
    else if (cepLimpo.length !== 8) avisos.push("CEP inválido — precisa ter 8 dígitos");
    // Quartos e banheiros para residencial — o feed força o mínimo 1, mas é melhor informar
    if (!isLote) {
      if (!parseInt(im.quartos)) avisos.push("Informe a quantidade de quartos");
      if (!parseInt(im.banheiros)) avisos.push("Informe a quantidade de banheiros");
    }
  }
  return avisos;
}
