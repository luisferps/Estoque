import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyB8Jq17jELr17zonEVmLRjy-p7dmeLLskw",
  authDomain: "estoque-53f1e.firebaseapp.com",
  projectId: "estoque-53f1e",
  storageBucket: "estoque-53f1e.firebasestorage.app",
  messagingSenderId: "265114904725",
  appId: "1:265114904725:web:c97ac40636b76b6c8f939c"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
