/**
 * Servidor de produção — serve o SPA compilado (dist/) no Railway.
 * Em dev use `npm run dev` (Vite). Aqui é só para produção.
 */
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, "..", "dist");
const app = express();
const port = Number(process.env.PORT) || 3000;

if (!existsSync(dist)) {
  console.warn("[server] dist/ não encontrado — rode `npm run build` antes de `npm start`.");
}

app.use(express.static(dist, { maxAge: "1h", index: "index.html" }));

// SPA fallback (todas as rotas caem no index.html)
app.get("*", (_req, res) => res.sendFile(join(dist, "index.html")));

app.listen(port, () => console.log(`[server] LotR2 2026 em http://0.0.0.0:${port}`));
