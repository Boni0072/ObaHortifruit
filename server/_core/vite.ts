import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function setupVite(app: Express, server: Server) {
  const { createServer: createViteServer } = await import("vite");
  const viteConfigModule = await import("../../vite.config.js");
  const viteConfig = (viteConfigModule as any).default || viteConfigModule;
  const config = (viteConfig as any).default || viteConfig;

  const serverOptions = {
    ...config.server,
    middlewareMode: true,
    hmr: {
      ...config.server?.hmr,
      server,
    },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...config,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    // Se a URL parecer um arquivo (tiver extensão) e não for html, retorna 404
    // Isso evita o erro "Unexpected token '<'" em scripts/imagens faltando
    if (url.match(/\.[a-zA-Z0-9]+$/) && !url.endsWith(".html") && !url.startsWith("/api/")) {
      return res.status(404).end();
    }

    try {
      const clientTemplate = path.resolve(
        __dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(__dirname, "../..", "dist", "public")
      : path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    // Mesma verificação para produção
    if (_req.originalUrl.match(/\.[a-zA-Z0-9]+$/) && !_req.originalUrl.endsWith(".html") && !_req.originalUrl.startsWith("/api/")) {
      return res.status(404).end();
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
