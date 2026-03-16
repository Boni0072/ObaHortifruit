import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { mergeRouters } from "@trpc/server";
import { appRouter as mainRouter } from "../routers";
import { createContext } from "./context";
import { registerOAuthRoutes } from "./oauth";
import { fileURLToPath } from "url";
import path from "path";
import { router } from "./trpc";
import { authRouter } from "./authRouter";

export const app = express();
const server = createServer(app);

// Garante que o router de auth esteja disponível mesmo se não estiver no ../routers
const appRouter = mergeRouters(mainRouter, router({
  auth: authRouter
}));

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
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    const { serveStatic } = await import("./vite");
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  
  // Em produção, confia na porta do ambiente. Em dev, busca uma porta livre.
  const port = process.env.NODE_ENV === "production" 
    ? preferredPort 
    : await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
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