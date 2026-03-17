import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = "/login" } = options ?? {};
  const utils = trpc.useUtils();

  // Verifica se há um usuário no localStorage (fallback rápido)
  const localUserStr = typeof window !== 'undefined' ? localStorage.getItem("obras_user") : null;
  const localUser = localUserStr ? JSON.parse(localUserStr) : null;
  const hasToken = typeof window !== 'undefined' ? !!localStorage.getItem("obras_token") : false;

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    // Se temos token mas a query falha, não removemos o usuário imediatamente
    enabled: hasToken,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      localStorage.removeItem("obras_token");
      localStorage.removeItem("obras_user");
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      console.error("Erro no logout:", error);
    } finally {
      utils.auth.me.setData(undefined, null);
      window.location.href = "/login";
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    // Usa os dados da API se disponíveis, senão usa o local (se houver token)
    const user = meQuery.data !== undefined ? meQuery.data : (hasToken ? localUser : null);
    
    if (user) {
      localStorage.setItem("manus-runtime-user-info", JSON.stringify(user));
    }
    
    return {
      user,
      loading: meQuery.isLoading && !localUser, // Só mostra loading se não tivermos dados locais
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: !!user,
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    localUser,
    hasToken
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (state.loading || logoutMutation.isPending) return;
    if (state.isAuthenticated) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    state.loading,
    state.isAuthenticated,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}