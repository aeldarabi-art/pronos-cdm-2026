// firebase.js
// Configuration Firebase - Remplace ces valeurs par celles de TON projet Firebase
// Console Firebase > Paramètres du projet > Tes applications > SDK config

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBU6zrgcaQhs4p6MbPwMWcgWB2ZQeXh-mY",
  authDomain: "pronostic-inwi2026.firebaseapp.com",
  projectId: "pronostic-inwi2026",
  storageBucket: "pronostic-inwi2026.firebasestorage.app",
  messagingSenderId: "179300040255",
  appId: "1:179300040255:web:bcca61e1fa7f0ce9bec28a"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);

export {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp
};
