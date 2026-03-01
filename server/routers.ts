import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { projectsRouter } from "./routers/projects";
import { budgetsRouter } from "./routers/budgets";
import { budgetItemsRouter } from "./routers/budgetItems";
import { expensesRouter } from "./routers/expenses";
import { assetsRouter } from "./routers/assets";
import { accountingRouter } from "./routers/accounting";
import { usersRouter } from "./routers/users";
import { nfeRouter } from "./routers/nfe";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  projects: projectsRouter,

  budgets: budgetsRouter,

  expenses: expensesRouter,

  budgetItems: budgetItemsRouter,

  assets: assetsRouter,

  accounting: accountingRouter,

  users: usersRouter,

  nfe: nfeRouter,
});

export type AppRouter = typeof appRouter;
