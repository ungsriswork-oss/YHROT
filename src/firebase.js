// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// นำเข้า getFirestore เพื่อใช้งานฐานข้อมูล
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDu_3Z9nzUHUWqKJKVQ-QK9G8UJkKCZZS8",
  authDomain: "yhrotshedule.firebaseapp.com",
  projectId: "yhrotshedule",
  storageBucket: "yhrotshedule.firebasestorage.app",
  messagingSenderId: "545537469578",
  appId: "1:545537469578:web:4119ff3eb70fde54191173"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore และ Export ตัวแปร db ออกไปให้ไฟล์อื่นใช้งาน
export const db = getFirestore(app);