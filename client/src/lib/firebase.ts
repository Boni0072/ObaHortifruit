import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBZ2zlstYh5od_ut-YOgDUDtFjIiPUIvhk",
  authDomain: "obahrtfruit.firebaseapp.com",
  projectId: "obahrtfruit",
  storageBucket: "obahrtfruit.firebasestorage.app",
  messagingSenderId: "162023336669",
  appId: "1:162023336669:web:5d3069a8dce75eb38b4934"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };