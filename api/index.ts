import { createHTTPHandler } from '@trpc/server/adapters/standalone';
import { appRouter } from '../server/routers/index.js';
import { createContext } from '../server/_core/context.js';

// Inicializa o handler do tRPC
const handler = createHTTPHandler({
  router: appRouter,
  createContext,
});

export default async function (req: any, res: any) {
  // Adiciona headers CORS para garantir que o frontend consiga acessar
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    return await handler(req, res);
  } catch (error) {
    console.error("Erro crítico na API:", error);
    res.status(500).json({
      error: {
        message: "Erro interno do servidor",
        code: -32603,
        data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 }
      }
    } );
  }
}