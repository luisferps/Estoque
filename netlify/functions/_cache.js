// netlify/functions/_cache.js
// Cache de resposta das funcoes de feed.
//
// Cada feed le a colecao "imoveis" inteira no Firestore. Sem cache, cada
// puxada de portal (e cada robo que passa) cobra uma leitura por imovel —
// foi o que estourou a cota diaria do plano gratuito.
//
// Duas camadas:
//   1. memoria do container (sobrevive entre invocacoes enquanto a funcao
//      esta quente) — zero leitura no Firestore;
//   2. Netlify-CDN-Cache-Control — o CDN serve o XML sem nem acordar a funcao.

const TTL_MS = 10 * 60 * 1000; // 10 minutos
const memoria = new Map();

function comCache(chave, gerar) {
  return async (...args) => {
    const guardado = memoria.get(chave);
    if (guardado && Date.now() - guardado.em < TTL_MS) {
      return guardado.resposta;
    }

    const resposta = await gerar(...args);

    if (resposta && resposta.statusCode === 200) {
      resposta.headers = {
        ...(resposta.headers || {}),
        "Netlify-CDN-Cache-Control": "public, max-age=600, stale-while-revalidate=3600, durable",
      };
      memoria.set(chave, { em: Date.now(), resposta });
    }

    return resposta;
  };
}

module.exports = { comCache };
