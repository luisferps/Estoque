// netlify/functions/_firebase.js
// Inicializa o Firebase Admin SDK uma única vez por instância da função.
// Lê credenciais das variáveis de ambiente do Netlify:
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY  (com \n literais — convertemos abaixo)

const admin = require("firebase-admin");

let initialized = false;

function getDb() {
  if (!initialized) {
    if (admin.apps.length === 0) {
      const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey,
        }),
      });
    }
    initialized = true;
  }
  return admin.firestore();
}

// Registra a hora em que um portal puxou o feed (last-pull por canal).
// Grava em configuracoes/feedPulls -> { canalpro: ISO, chavesnamao: ISO, meta: ISO }.
// Best-effort: nunca derruba o feed se falhar.
async function registrarPull(canal) {
  try {
    const db = getDb();
    await db.collection("configuracoes").doc("feedPulls").set(
      { [canal]: new Date().toISOString() },
      { merge: true }
    );
  } catch (e) {
    console.error("registrarPull falhou:", e.message);
  }
}

module.exports = { getDb, registrarPull };
