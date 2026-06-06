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

module.exports = { getDb };
