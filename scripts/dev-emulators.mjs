// Segunda instancia de desarrollo contra los emuladores de Firebase (puerto 3001, carpeta .next-emuladores).
// Sirve para probar sin tocar el proyecto real. Antes: `pnpm emulators` en otra terminal.
import { spawn } from "node:child_process";

const env = {
  ...process.env,
  NEXT_DIST_DIR: ".next-emuladores",
  FIREBASE_PROJECT_ID: "demo-racha",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
};
const child = spawn("pnpm", ["exec", "next", "dev", "--port", "3001"], { env, stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
