
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

/**
 * FIREBASE CONFIGURATION
 * 
 * IMPORTANT: You must replace the placeholders below with your actual 
 * Firebase project credentials found in the Firebase Console.
 * 
 * Go to: Project Settings -> General -> Your Apps -> Firebase SDK snippet -> Config
 */
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
