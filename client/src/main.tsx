const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: import.meta.env.VITE_API_URL || "/api/trpc",
      transformer: superjson,
      async fetch(input, init ) {
        const token = localStorage.getItem("obras_token");
        
        try {
          const response = await globalThis.fetch(input, {
            ...(init ?? {}),
            credentials: "include",
            headers: {
              ...(init?.headers ?? {}),
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          });

          // Se a resposta não for ok e não for JSON, criamos uma resposta JSON de erro
          // Isso evita o erro de parsing do tRPC que causa crash na aplicação
          const contentType = response.headers.get("content-type");
          if (!response.ok && (!contentType || !contentType.includes("application/json"))) {
            console.error(`[tRPC Fetch Error] Status: ${response.status}, URL: ${input.toString()}`);
            
            // Retorna uma resposta mockada para o tRPC lidar graciosamente
            return new Response(
              JSON.stringify({
                error: {
                  message: `Erro do servidor: ${response.status}`,
                  code: response.status === 401 || response.status === 403 ? -32001 : -32603,
                  data: {
                    code: response.status === 401 || response.status === 403 ? "UNAUTHORIZED" : "INTERNAL_SERVER_ERROR",
                    httpStatus: response.status
                  }
                }
              } ),
              {
                status: response.status,
                headers: { "Content-Type": "application/json" }
              }
            );
          }

          return response;
        } catch (error) {
          console.error("[tRPC Network Error]", error);
          // Em caso de falha de rede, retorna um erro formatado para o tRPC
          return new Response(
            JSON.stringify({
              error: {
                message: "Erro de conexão com o servidor",
                code: -32001,
                data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 }
              }
            } ),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      },
    }),
  ],
});