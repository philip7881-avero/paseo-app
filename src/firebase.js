import { initializeApp } from 'firebase/app'
import { getDatabase, ref, get, set } from 'firebase/database'

// La URL viene de la variable de entorno que configuras en Vercel
const firebaseConfig = {
  databaseURL: import.meta.env.VITE_FIREBASE_URL,
}

const app = initializeApp(firebaseConfig)
const db  = getDatabase(app)

// Equivalente a window.storage.get — lee un valor de Firebase
export async function sg(key) {
  try {
    const snap = await get(ref(db, key))
    return snap.val()          // null si no existe
  } catch {
    return null
  }
}

// Equivalente a window.storage.set — escribe un valor en Firebase
export async function ss(key, val) {
  try {
    await set(ref(db, key), val)
  } catch (e) {
    console.error('Firebase write error:', e)
  }
}
