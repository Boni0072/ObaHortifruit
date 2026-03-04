import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../db";
import { sdk } from "./sdk";
import { db, auth } from "../../firebase";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let devTokenData: { uid: string; email: string; name: string } | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Ignora erro do SDK padrão e tenta outros métodos abaixo
  }

  // Se não autenticou pelo SDK, tenta via Firebase Auth (Header Authorization)
  if (!user) {
    const authHeader = opts.req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const idToken = authHeader.split("Bearer ")[1];
      
      // Fallback para tokens legados em desenvolvimento (evita 401 se o token antigo estiver no cache)
      if (process.env.NODE_ENV === "development" && (idToken === "mock-session-token" || idToken === "mock-session-token-admin")) {
        devTokenData = {
          uid: "dev-admin-legacy",
          email: "admin@local.dev",
          name: "Admin Local (Legacy)"
        };
      }

      // 1. Tenta via Admin SDK (se disponível)
      if (auth) {
        try {
          const decodedToken = await auth.verifyIdToken(idToken);
          const userSnap = await db.collection("users").doc(decodedToken.uid).get();
          
          if (userSnap.exists) {
            const userData = userSnap.data();
            user = {
              openId: decodedToken.uid,
              email: decodedToken.email || "",
              name: (userData?.name as string) || decodedToken.name || "Usuário",
              loginMethod: "firebase",
              role: (userData?.role as string) || "user",
              lastSignedIn: new Date(),
            } as User;
          }
        } catch (e) {
          console.warn("[Context] Admin SDK verification failed:", e);
        }
      }

      // 2. Fallback para Dev: Decodificação manual se o Admin SDK falhou ou não existe
      // Isso garante que devTokenData seja preenchido mesmo se o Admin SDK estiver "meio" configurado mas falhando
      if (!user && process.env.NODE_ENV === "development") {
        try {
          const parts = idToken.split('.');
          if (parts.length === 3) {
            let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const pad = base64.length % 4;
            if (pad) {
              base64 += new Array(5 - pad).join('=');
            }

            const payload = JSON.parse(Buffer.from(base64, 'base64').toString());
            const uid = payload.user_id || payload.sub;
            const email = payload.email;
            const name = payload.name || payload.email?.split('@')[0] || "Usuário";
            
            devTokenData = { uid, email, name };
            
            if (uid) {
              // Tenta buscar dados reais no Firestore (Admin SDK)
              let userDoc = await db.collection("users").doc(uid).get();
              let userData = userDoc.exists ? userDoc.data() : null;
              let finalUid = uid;
              
              // Se não achou pelo UID, tenta pelo email
              if (!userData && email) {
                const q = db.collection("users").where("email", "==", email);
                const querySnapshot = await q.get();
                if (!querySnapshot.empty) {
                  const docSnap = querySnapshot.docs[0];
                  userData = docSnap.data();
                  finalUid = docSnap.id;
                }
              }
              
              if (userData) {
                user = {
                  openId: finalUid,
                  email: email || userData.email || "",
                  name: userData.name || name,
                  loginMethod: "firebase",
                  role: userData.role || "user",
                  allowedPages: userData.allowedPages || [],
                  lastSignedIn: new Date(),
                } as User;
              }
            }
          }
        } catch (err) {
          console.error("[Context] Failed to decode token in dev mode:", err);
        }
      }
    }
  }

  // Fallback: Em desenvolvimento, se a autenticação falhar, usamos um usuário mock
  if (!user && process.env.NODE_ENV === "development") {
      console.log("[Context] No user authenticated, using development fallback.");
      
      if (devTokenData) {
        console.log(`[Context] Using decoded token data for fallback: ${devTokenData.name}`);
        user = {
          openId: devTokenData.uid,
          email: devTokenData.email || "dev@local.dev",
          name: devTokenData.name,
          loginMethod: "firebase-dev",
          role: "admin", // Assume admin em dev se falhar o banco, para não bloquear
          lastSignedIn: new Date(),
          allowedPages: [],
        };
      }
  }

  console.log("[Context] Final user object for this request:", user);

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
