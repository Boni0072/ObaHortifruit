import type { Project, Asset, Budget } from "../../../drizzle/schema";

interface ProjectBudgetCardProps {
  project: Project | undefined;
  assets: Asset[] | undefined;
  budgets: Budget[] | undefined;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

export function ProjectBudgetCard({ project, assets, budgets }: ProjectBudgetCardProps) {
  if (!project) {
    return null;
  }

  const budgetRealizado = assets?.reduce((acc, asset) => acc + Number(asset.value || 0), 0) || 0;
  const budgetPlanejado = budgets?.reduce((acc, budget) => acc + Number(budget.plannedAmount), 0) || 0;
  const budgetVariacao = budgetPlanejado - budgetRealizado;
  const budgetProgresso = budgetPlanejado > 0 ? (budgetRealizado / budgetPlanejado) * 100 : 0;

  return (
    <div className="mt-6 space-y-6">
      <div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-xs text-gray-500">Planejado</p>
            <p className="font-semibold text-foreground text-lg">{formatCurrency(budgetPlanejado)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Realizado</p>
            <p className="font-semibold text-green-600 text-lg">{formatCurrency(budgetRealizado)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Disponível</p>
            <p className={`font-semibold text-lg ${budgetVariacao >= 0 ? 'text-foreground' : 'text-red-600'}`}>{formatCurrency(budgetVariacao)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Progresso do Orçamento</p>
            <p className="font-semibold text-foreground text-lg">{budgetProgresso.toFixed(1)}%</p>
          </div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5 mt-4">
          <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${budgetProgresso > 100 ? 100 : budgetProgresso}%` }}></div>
        </div>
      </div>
      {budgets && budgets.length > 0 && (
        <div>
          <h4 className="text-md font-semibold text-foreground mb-2">Detalhamento do Orçamento</h4>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium text-gray-600">Descrição</th>
                  <th className="px-4 py-2 font-medium text-gray-600 text-right">Valor Planejado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {budgets.map((budget) => (
                  <tr key={(budget as any).id}>
                    <td className="px-4 py-3">{(budget as any).description || 'Orçamento sem descrição'}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(Number(budget.plannedAmount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}