import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDprFSVQffYye3pExmqT0SmImaCbLnjQ4s",
  authDomain: "car-repair-tracker.firebaseapp.com",
  projectId: "car-repair-tracker",
  storageBucket: "car-repair-tracker.firebasestorage.app",
  messagingSenderId: "965311843325",
  appId: "1:965311843325:web:00400fb574af1e5081e794"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };



