import { publicProcedure, router } from "./trpc.js";

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => {
    return ctx.user ?? null;
  }),
});