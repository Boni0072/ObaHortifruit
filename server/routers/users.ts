import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { auth, db } from "../../firebase";
import { protectedProcedure, router, adminProcedure } from "../_core/trpc";

export const usersRouter = router({
  list: adminProcedure.query(async () => {
    try {
      const authUsers = await auth.listUsers(1000);
      const userDocs = await db.collection("users").get();

      const users = authUsers.users.map((user) => {
        const userDoc = userDocs.docs.find((d) => d.id === user.uid);
        const userData = userDoc ? userDoc.data() : {};

        return {
          id: user.uid,
          email: user.email || "",
          name: user.displayName || (userData.name as string) || "Sem Nome",
          role: (userData.role as string) || "user",
          allowedPages: (userData.allowedPages as string[]) || [],
          createdAt: user.metadata.creationTime,
        };
      });

      return users;
    } catch (error) {
      console.error("Erro ao listar usuários:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro ao listar usuários",
      });
    }
  }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string(),
        email: z.string().email(),
        password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
        role: z.string(),
        allowedPages: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      console.log(`[Users] Tentando criar usuário auth: ${input.email}`);
      try {
        let uid: string;

        // 1. Criar usuário no Firebase Authentication
        const userRecord = await auth.createUser({
          email: input.email,
          password: input.password,
          displayName: input.name,
        });
        uid = userRecord.uid;
        console.log(`[Users] Usuário criado no Auth com UID: ${uid}`);

        // 2. Salvar metadados no Firestore usando o UID como ID do documento
        const dataToSave = {
          ...input,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await db.collection("users").doc(uid).set(dataToSave);

        console.log(`[Users] Metadados do usuário salvos no Firestore! ID: ${uid}`);
        return { id: uid };
      } catch (error: any) {
        console.error("Erro ao criar usuário:", error);

        if (error instanceof TRPCError) {
          throw error;
        }

        // Códigos de erro comuns do Firebase Admin SDK
        if (error.code === 'auth/email-already-exists') {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Este e-mail já está em uso.",
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao criar usuário. Verifique os logs do servidor.",
        });
      }
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        email: z.string().email().optional(),
        password: z.string().optional(),
        role: z.string().optional(),
        allowedPages: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const { id, ...data } = input;
        const { password } = input;

        // Atualiza no Firebase Auth se necessário
        if (data.email || data.name || (password && password.length >= 6)) {
          await auth.updateUser(id, {
            ...(data.email && { email: data.email }),
            ...(data.name && { displayName: data.name }),
            ...(password && password.length >= 6 && { password: password }),
          });
        }
        
        // Atualiza no Firestore
        const updateData = Object.fromEntries(
          Object.entries(data).filter(([_, v]) => v !== undefined)
        );
        const finalUpdateData = { ...updateData, updatedAt: new Date() };
        await db.collection("users").doc(id).update(finalUpdateData);

        return { success: true };
      } catch (error) {
        console.error("Erro ao atualizar usuário:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao atualizar usuário",
        });
      }
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      try {
        // 1. Deletar do Firebase Authentication
        await auth.deleteUser(input.id);
        console.log(`[Users] Usuário deletado do Auth: ${input.id}`);

        // 2. Deletar do Firestore
        await db.collection("users").doc(input.id).delete();
        console.log(`[Users] Usuário deletado do Firestore: ${input.id}`);

        return { success: true };
      } catch (error) {
        console.error("Erro ao deletar usuário:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao deletar usuário",
        });
      }
    }),
});