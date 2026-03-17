import { router } from "../_core/trpc.js";
import { projectsRouter } from "./projects.js";
import { expensesRouter } from "./expenses.js";
import { budgetsRouter } from "./budgets.js";
import { assetsRouter } from "./assets.js";
import { accountingRouter } from "./accounting.js";
import { budgetItemsRouter } from "./budgetItems.js";
import { usersRouter } from "./users.js";
import { publicProcedure } from "../_core/trpc.js";

export const appRouter = router({
  auth: router({
    me: publicProcedure.query(({ ctx }) => {
      return ctx.user ?? null;
    }),
  }),
  projects: projectsRouter,
  expenses: expensesRouter,
  budgets: budgetsRouter,
  assets: assetsRouter,
  accounting: accountingRouter,
  budgetItems: budgetItemsRouter,
  users: usersRouter,
});

export type AppRouter = typeof appRouter;