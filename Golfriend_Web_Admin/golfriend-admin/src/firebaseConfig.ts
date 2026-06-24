import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDdcu6nWK4_wFqeuqZ5HodZ8GhLiLmIOYY",
  authDomain: "golfriend-v1.firebaseapp.com",
  projectId: "golfriend-v1",
  storageBucket: "golfriend-v1.firebasestorage.app",
  messagingSenderId: "368292182099",
  appId: "1:368292182099:web:986581e047a7e2ee2ceea6"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);