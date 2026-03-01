import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { consultarNfe } from "../nfe-scraper";

export const nfeRouter = router({
  consultar: protectedProcedure
    .input(z.object({ chave: z.string().length(44, "A chave de acesso deve ter 44 dígitos.") }))
    .mutation(async ({ input }) => {
      try {
        const data = await consultarNfe(input.chave);
        return data;
      } catch (error: any) {
        console.error("tRPC NFE Scraper Error:", error);
        throw new Error(`Falha ao executar o scraper de NF-e: ${error.message || "Erro desconhecido"}. Verifique se o navegador abriu.`);
      }
    }),
});