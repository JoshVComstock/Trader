import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}. Revisa .env.local (ver README).`);
  }
  return value;
}

/** El JSON de la cuenta de servicio, si se indicó un archivo (cómodo en local). */
function serviceAccountFile(): { client_email?: string; private_key?: string; project_id?: string } | null {
  const file = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
  if (!file || process.env.FIREBASE_CLIENT_EMAIL) return null;
  const path = isAbsolute(file) ? file : join(/*turbopackIgnore: true*/ process.cwd(), file);
  if (!existsSync(path)) {
    throw new Error(
      `No encuentro la cuenta de servicio de Firebase en ${file}. Descárgala en Consola de Firebase → Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada, y guárdala con ese nombre en la raíz del proyecto.`,
    );
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Cuenta de servicio de Firebase (Admin SDK). Solo en el servidor. */
export function firebaseAdminEnv() {
  const projectId = required("FIREBASE_PROJECT_ID", process.env.FIREBASE_PROJECT_ID);
  // Con los emuladores no hace falta la cuenta de servicio.
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    return { projectId, clientEmail: null, privateKey: null };
  }
  const json = serviceAccountFile();
  if (json?.client_email && json.private_key) {
    return { projectId, clientEmail: json.client_email, privateKey: json.private_key };
  }
  return {
    projectId,
    clientEmail: required("FIREBASE_CLIENT_EMAIL", process.env.FIREBASE_CLIENT_EMAIL),
    // En .env la clave viene en una línea con "\n" escritos: se vuelven saltos reales.
    privateKey: required("FIREBASE_PRIVATE_KEY", process.env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, "\n"),
  };
}

/** Clave web de Firebase: la usa el servidor para iniciar sesión con email y contraseña. */
export function firebaseWebApiKey(): string {
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) return process.env.FIREBASE_WEB_API_KEY ?? "emulador";
  return required("FIREBASE_WEB_API_KEY", process.env.FIREBASE_WEB_API_KEY);
}
