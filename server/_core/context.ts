import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../db.js";
import { sdk } from "./sdk.js";
import { db, auth } from "../../firebase.js";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  try {
    let user: User | null = null;
    let devTokenData: { uid: string; email: string; name: string } | null = null;

    // 1. Tenta autenticar via SDK padrão (se configurado)
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch (error) {
      // Ignora erro do SDK padrão e tenta outros métodos
    }

    // 2. Se não autenticou pelo SDK, tenta via Header Authorization (Firebase/Mock)
    if (!user) {
      const authHeader = opts.req.headers.authorization;
      
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const idToken = authHeader.split("Bearer ")[1];
        
        // Fallback para tokens legados em desenvolvimento
        if (idToken === "mock-session-token" || idToken === "mock-session-token-admin") {
          user = {
            openId: "dev-admin-legacy",
            email: "admin@local.dev",
            name: "Admin Local (Legacy)",
            loginMethod: "mock",
            role: "admin",
            lastSignedIn: new Date(),
          } as User;
        } else {
          // Tenta decodificar o token JWT (Mock ou Firebase)
          try {
            // Verifica se é um token mock gerado pelo frontend
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
              
              // Se temos o Firebase Admin configurado, tenta buscar o usuário real
              if (auth && db) {
                try {
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
                } catch (dbError) {
                  console.warn("[Context] Erro ao buscar usuário no Firestore:", dbError);
                }
              }
              
              // Se não conseguiu buscar no banco, mas decodificou o token, usa os dados do token
              if (!user && devTokenData) {
                user = {
                  openId: devTokenData.uid,
                  email: devTokenData.email || "",
                  name: devTokenData.name,
                  loginMethod: "jwt",
                  role: devTokenData.email === "admin@oba.com" ? "admin" : "user",
                  lastSignedIn: new Date(),
                } as User;
              }
            }
          } catch (err) {
            console.error("[Context] Falha ao decodificar token:", err);
          }
        }
      }
    }

    return {
      req: opts.req,
      res: opts.res,
      user,
    };
  } catch (err) {
    console.error("[Context] Erro crítico no createContext:", err);
    // Retorna um contexto válido com user null em vez de lançar erro 500
    return {
      req: opts.req,
      res: opts.res,
      user: null,
    };
  }
}