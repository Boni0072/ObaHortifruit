import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter as mainRouter } from "../routers/index.js";
import { createContext } from "./context.js";
import { registerOAuthRoutes } from "./oauth.js";
import { fileURLToPath } from "url";
import path from "path";

export const app = express();
const server = createServer(app);

const appRouter = mainRouter;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Rota de diagnóstico para verificar a saúde do servidor e o status da variável de ambiente
app.get("/api/health", (req, res) => {
  const firebaseKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const firebaseKeyStatus = firebaseKey
    ? `Definida, Comprimento: ${firebaseKey.length}, Início: '${firebaseKey.substring(0, 20)}...'`
    : "NÃO DEFINIDA";

  res.status(200).json({
    status: "ok",
    message: "Servidor Express está rodando.",
    timestamp: new Date().toISOString(),
    firebaseKeyStatus: firebaseKeyStatus,
  });
});

registerOAuthRoutes(app);

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

async function startServer() {
  if (process.env.NODE_ENV === "development") {
    const { setupVite } = await import("./vite.js");
    await setupVite(app, server);
  } else {
    const { serveStatic } = await import("./vite.js");
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "3000");

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

// Inicia o servidor apenas se executado diretamente (não importado pelo Vercel)
const currentFile = fileURLToPath(import.meta.url);
const executedFile = process.argv[1];
const isMainModule = executedFile && (
  path.resolve(executedFile) === path.resolve(currentFile) ||
  (process.platform === "win32" && path.resolve(executedFile).toLowerCase() === path.resolve(currentFile).toLowerCase())
);

if (isMainModule) {
  startServer().catch(console.error);
}

// Exporta o app para o Vercel (Serverless Function)
export default app;