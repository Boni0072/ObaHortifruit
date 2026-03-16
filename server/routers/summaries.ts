import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import { protectedProcedure, router } from "../_core/trpc";

// Função auxiliar para contar documentos
async function countDocs(collectionName: string, userId: string) {
  const collRef = collection(db, collectionName);
  const q = query(collRef, where("userId", "==", userId));
  const snapshot = await getDocs(q);
  return snapshot.size;
}

// Função auxiliar para somar um campo
async function sumField(collectionName: string, field: string, userId: string) {
  const collRef = collection(db, collectionName);
  const q = query(collRef, where("userId", "==", userId));
  const snapshot = await getDocs(q);
  return snapshot.docs.reduce((total, doc) => total + (doc.data()[field] || 0), 0);
}

export const summariesRouter = router({
  /**
   * Retorna um resumo de dados para o dashboard principal.
   * Inclui contagem de projetos, total de despesas e orçamentos.
   */
  getDashboardSummary: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.openId;

    // Executa as agregações em paralelo para maior eficiência
    const [
      totalProjects,
      totalExpenses,
      totalBudget,
    ] = await Promise.all([
      countDocs("projects", userId),
      sumField("expenses", "amount", userId), // Assumindo que o campo é 'amount'
      sumField("budgets", "totalAmount", userId), // Assumindo que o campo é 'totalAmount'
    ]);

    return {
      totalProjects,
      totalExpenses,
      totalBudget,
    };
  }),
});
