import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBbPI2AqWQ1CZi7qOzmZuc8Hd1XxA5bTMw",
  authDomain: "logistica-7343c.firebaseapp.com",
  databaseURL: "https://logistica-7343c-default-rtdb.firebaseio.com",
  projectId: "logistica-7343c",
  storageBucket: "logistica-7343c.firebasestorage.app",
  messagingSenderId: "32263281959",
  appId: "11:32263281959:web:c7cd321d1bbab7784a5d02"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };