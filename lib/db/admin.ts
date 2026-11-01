import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { firebaseAdminEnv } from "@/lib/env";

/**
 * Firebase Admin, una sola instancia por proceso. Todo el acceso a Firestore pasa por el servidor:
 * las reglas de seguridad cierran el acceso directo desde el navegador (ver firestore.rules).
 */
function app(): App {
  if (getApps().length) return getApp();
  const env = firebaseAdminEnv();
  return initializeApp(
    env.clientEmail && env.privateKey
      ? { projectId: env.projectId, credential: cert({ projectId: env.projectId, clientEmail: env.clientEmail, privateKey: env.privateKey }) }
      : { projectId: env.projectId },
  );
}

let firestore: Firestore | null = null;

export function db(): Firestore {
  if (!firestore) {
    firestore = getFirestore(app());
    // Los campos opcionales ausentes no rompen las escrituras. REST arranca más rápido que gRPC
    // en serverless (el emulador sí necesita gRPC).
    firestore.settings({ ignoreUndefinedProperties: true, preferRest: !process.env.FIRESTORE_EMULATOR_HOST });
  }
  return firestore;
}

export function adminAuth() {
  return getAuth(app());
}
