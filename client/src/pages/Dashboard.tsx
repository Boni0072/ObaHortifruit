import { useState, useMemo, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip as RechartsTooltip, PieChart, Pie, Cell, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, DollarSign, Package, Activity, BarChart3, ArrowUpRight, AlertTriangle, TrendingDown, Target, Wallet } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLocation } from "wouter";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

const STATUS_COLORS: Record<string, string> = {
  aguardando_classificacao: '#3b82f6', // blue-500
  aguardando_engenharia: '#eab308', // yellow-500
  aguardando_diretoria: '#f97316', // orange-500
  aprovado: '#22c55e', // green-500
  rejeitado: '#ef4444', // red-500
  planejamento: '#64748b', // slate-500
  em_andamento: '#a855f7', // purple-500
  concluido: '#14b8a6', // teal-500
  pausado: '#ec4899', // pink-500
  sem_status: '#94a3b8' // slate-400
};

// Helper para processar datas do Firestore (Timestamp) ou Strings ISO
const parseDate = (value: any): Date => {
  if (!value) return new Date();
  if (typeof value.toDate === 'function') return value.toDate(); // Firestore Timestamp
  if (value instanceof Date) return value;
  return new Date(value);
};

export default function Dashboard() {
  const [viewMode, setViewMode] = useState<'budget' | 'assets'>('budget');

  const [projects, setProjects] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [allBudgets, setAllBudgets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubProjects = onSnapshot(collection(db, "projects"), (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubExpenses = onSnapshot(collection(db, "expenses"), (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubAssets = onSnapshot(collection(db, "assets"), (snapshot) => {
      setAssets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubBudgets = onSnapshot(collection(db, "budgets"), (snapshot) => {
      setAllBudgets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Pequeno delay para garantir que o loading não pisque muito rápido ou fique preso
    const timer = setTimeout(() => setIsLoading(false), 800);

    return () => {
      unsubProjects();
      unsubExpenses();
      unsubAssets();
      unsubBudgets();
      clearTimeout(timer);
    };
  }, []);

  // Capex Metrics
  const totalCapex = expenses?.filter(e => e.type === 'capex').reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;
  const totalOpex = expenses?.filter(e => e.type === 'opex').reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;
  const totalExpenses = totalCapex + totalOpex;
  const capexPercentage = totalExpenses > 0 ? (totalCapex / totalExpenses) * 100 : 0;
  
  // Assets Metrics
  const totalAssetsValue = useMemo(() => {
    if (!assets) return 0;
    return assets.reduce((acc, asset) => {
      const assetExpenses = expenses?.filter(e => String(e.assetId) === String(asset.id)) || [];
      const cost = assetExpenses.reduce((sum, curr) => sum + Number(curr.amount), Number(asset.value || 0));
      return acc + cost;
    }, 0);
  }, [assets, expenses]);

  const assetsInProgress = assets?.filter(a => a.status !== 'concluido').length || 0;
  const assetsCompleted = assets?.filter(a => a.status === 'concluido').length || 0;
  const totalAssets = assets?.length || 0;

  // Asset Classes Metrics (Calculated)
  const assetClassesData = useMemo(() => {
    if (!assets || !expenses) return [];

    const classMap: Record<string, { cost: number; depreciation: number; residual: number; count: number }> = {};

    assets.forEach((asset: any) => {
      // Calculate Cost (Asset Value + Linked Expenses)
      const assetExpenses = expenses.filter(e => String(e.assetId) === String(asset.id));
      const cost = assetExpenses.reduce((acc, curr) => acc + Number(curr.amount), Number(asset.value || 0));

      // Calculate Depreciation (Simplified straight-line)
      let depreciation = 0;
      const usefulLifeYears = Number(asset.usefulLife || 0);
      
      // Use availabilityDate if present (CPC 27), else startDate
      const startDateStr = asset.availabilityDate || asset.startDate;
      
      if (usefulLifeYears > 0 && startDateStr) {
        const startDate = new Date(startDateStr);
        const now = new Date();
        
        // Calculate months difference
        let monthsElapsed = (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth());
        if (monthsElapsed < 0) monthsElapsed = 0;

        const totalMonths = usefulLifeYears * 12;
        const residualValueEstimated = Number(asset.residualValue || 0);
        const depreciableAmount = Math.max(0, cost - residualValueEstimated);
        
        const monthlyDepreciation = depreciableAmount / totalMonths;
        depreciation = Math.min(depreciableAmount, monthlyDepreciation * monthsElapsed);
      }

      const residual = cost - depreciation;
      const className = asset.assetClass || "Não Classificado";

      if (!classMap[className]) {
        classMap[className] = { cost: 0, depreciation: 0, residual: 0, count: 0 };
      }

      classMap[className].cost += cost;
      classMap[className].depreciation += depreciation;
      classMap[className].residual += residual;
      classMap[className].count += 1;
    });

    return Object.entries(classMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.cost - a.cost);
  }, [assets, expenses]);

  // Monthly Depreciation Chart Data (Current Year)
  const monthlyDepreciationData = useMemo(() => {
    if (!assets || !expenses) return [];

    const currentYear = new Date().getFullYear();
    const months = Array.from({ length: 12 }, (_, i) => i);
    
    return months.map(monthIndex => {
      const monthStart = new Date(currentYear, monthIndex, 1);
      const monthEnd = new Date(currentYear, monthIndex + 1, 0);
      
      let total = 0;

      assets.forEach((asset: any) => {
        const assetExpenses = expenses.filter(e => String(e.assetId) === String(asset.id));
        const cost = assetExpenses.reduce((acc, curr) => acc + Number(curr.amount), Number(asset.value || 0));
        const usefulLifeYears = Number(asset.usefulLife || 0);
        const startDateStr = asset.availabilityDate || asset.startDate;

        if (usefulLifeYears > 0 && startDateStr) {
          const assetStart = new Date(startDateStr);
          const assetEnd = new Date(assetStart);
          assetEnd.setMonth(assetStart.getMonth() + (usefulLifeYears * 12));

          if (assetStart <= monthEnd && assetEnd >= monthStart) {
             const residual = Number(asset.residualValue || 0);
             const depreciable = Math.max(0, cost - residual);
             const monthly = depreciable / (usefulLifeYears * 12);
             total += monthly;
          }
        }
      });

      const monthName = monthStart.toLocaleString('pt-BR', { month: 'short' });
      return { 
        name: monthName.charAt(0).toUpperCase() + monthName.slice(1), 
        value: total 
      };
    });
  }, [assets, expenses]);

  // Budget Control Metrics (FP&A)
  const budgetMetrics = useMemo(() => {
    if (!projects || !expenses || !allBudgets) return null;

    // Helper para obter o orçamento de um projeto, replicando a lógica da página de Budgets
    const getProjectBudget = (project: any) => {
      let plannedValue = Number(project.plannedValue || 0);
      if (plannedValue === 0) {
        const projectBudgets = allBudgets.filter((b: any) => String(b.projectId) === String(project.id));
        plannedValue = projectBudgets.reduce((sum, b) => sum + Number(b.plannedAmount || 0), 0);
      }
      return plannedValue;
    };

    // Considera TODOS os projetos para alinhar com a página de Budgets (que lista tudo)
    const allProjects = projects;
    const allProjectIds = new Set(allProjects.map(p => String(p.id)));
    
    // Garante que apenas despesas de projetos existentes sejam somadas
    const validExpenses = expenses.filter(e => allProjectIds.has(String(e.projectId)));

    const totalBudget = allProjects.reduce((acc, p) => acc + getProjectBudget(p), 0);
    const totalRealized = validExpenses.reduce((acc, e) => acc + Number(e.amount || 0), 0);
    const deviation = totalBudget - totalRealized;
    const consumptionPct = totalBudget > 0 ? (totalRealized / totalBudget) * 100 : 0;
    
    // Burn Rate (Average monthly expense of current year)
    const currentYear = new Date().getFullYear();
    const currentYearExpenses = validExpenses.filter(e => parseDate(e.date).getFullYear() === currentYear);
    const monthsElapsed = new Date().getMonth() + 1;
    const burnRate = currentYearExpenses.reduce((acc, e) => acc + Number(e.amount || 0), 0) / monthsElapsed;
    const runRate = burnRate * 12;

    // Cost Center Analysis
    const ccMap: Record<string, { budget: number; realized: number }> = {};
    
    allProjects.forEach(p => {
        const cc = p.costCenter || "Sem CC";
        if (!ccMap[cc]) ccMap[cc] = { budget: 0, realized: 0 };
        ccMap[cc].budget += getProjectBudget(p);
    });

    validExpenses.forEach(e => {
        // Find project for expense to get CC
        const project = allProjects.find(p => String(p.id) === String(e.projectId));
        const cc = project?.costCenter || "Sem CC";
        if (!ccMap[cc]) ccMap[cc] = { budget: 0, realized: 0 };
        ccMap[cc].realized += Number(e.amount || 0);
    });

    const costCenters = Object.entries(ccMap).map(([name, data]) => {
        const pct = data.budget > 0 ? (data.realized / data.budget) * 100 : 0;
        let status: 'verde' | 'amarelo' | 'vermelho' = 'verde';
        if (pct > 95) status = 'vermelho';
        else if (pct > 80) status = 'amarelo';

        return { name, ...data, pct, status, deviation: data.budget - data.realized };
    }).sort((a, b) => b.realized - a.realized);

    // Monthly Evolution (Budget vs Realized)
    const months = Array.from({ length: 12 }, (_, i) => i);
    
    // Distribuição do orçamento
    const monthlyBudgetMap = new Array(12).fill(0);
    
    allProjects.forEach(p => {
        // Prioriza a distribuição mensal manual se existir
        if (p.monthlyDistribution && Array.isArray(p.monthlyDistribution)) {
             p.monthlyDistribution.forEach((val: any, index: number) => {
                if (index < 12) {
                    monthlyBudgetMap[index] += Number(val || 0);
                }
            });
            return;
        }

        // Fallback: Distribuição linear baseada na duração dos projetos
        const planned = getProjectBudget(p);
        if (planned <= 0) return;

        const start = p.startDate ? parseDate(p.startDate) : new Date();
        // Se não houver data fim, assume fim do ano atual ou +1 ano para projeção
        const end = p.estimatedEndDate ? parseDate(p.estimatedEndDate) : new Date(start.getFullYear() + 1, start.getMonth(), 0);
        
        const currentYearStart = new Date(currentYear, 0, 1);
        const currentYearEnd = new Date(currentYear, 11, 31);

        // Interseção entre a duração do projeto e o ano atual
        const effectiveStart = start < currentYearStart ? currentYearStart : start;
        const effectiveEnd = end > currentYearEnd ? currentYearEnd : end;

        if (effectiveStart > effectiveEnd) return;

        // Calcula valor mensal (distribuição linear durante a vida do projeto)
        const totalMonthsDuration = Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1);
        const monthlyAmount = planned / totalMonthsDuration;

        const startMonthIndex = effectiveStart.getFullYear() === currentYear ? effectiveStart.getMonth() : 0;
        const endMonthIndex = effectiveEnd.getFullYear() === currentYear ? effectiveEnd.getMonth() : 11;

        for (let i = startMonthIndex; i <= endMonthIndex; i++) {
            monthlyBudgetMap[i] += monthlyAmount;
        }
    });

    const monthlyEvolution = months.map(monthIndex => {
        const monthName = new Date(currentYear, monthIndex, 1).toLocaleString('pt-BR', { month: 'short' });
        const monthRealized = currentYearExpenses
            .filter(e => parseDate(e.date).getMonth() === monthIndex)
            .reduce((acc, e) => acc + Number(e.amount || 0), 0);
        
        return { name: monthName, realized: monthRealized, budget: monthlyBudgetMap[monthIndex] };
    });

    // Projects by Status (Count)
    const statusMap: Record<string, number> = {};
    allProjects.forEach(p => {
        const status = p.status || 'sem_status';
        statusMap[status] = (statusMap[status] || 0) + 1;
    });

    const projectsByStatus = Object.entries(statusMap)
      .map(([name, value]) => ({ name, displayName: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), value }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);

    return {
        totalBudget, totalRealized, deviation, consumptionPct, burnRate, runRate, costCenters, monthlyEvolution, projectsByStatus
    };
  }, [projects, expenses, allBudgets]);

  // Asset Movement Data (Current Year)
  const assetMovementData = useMemo(() => {
    if (!assets || !expenses) return [];

    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);
    const now = new Date();

    const movementMap: Record<string, { 
      initialCost: number; 
      additions: number; 
      initialDepreciation: number; 
      periodDepreciation: number; 
    }> = {};

    assets.forEach((asset: any) => {
      const className = asset.assetClass || "Não Classificado";
      if (!movementMap[className]) {
        movementMap[className] = { initialCost: 0, additions: 0, initialDepreciation: 0, periodDepreciation: 0 };
      }

      // Cost Calculation
      const assetExpenses = expenses.filter(e => String(e.assetId) === String(asset.id));
      const totalCost = assetExpenses.reduce((acc, curr) => acc + Number(curr.amount), Number(asset.value || 0));
      
      // Date determination
      const acquisitionDateStr = asset.startDate; 
      const acquisitionDate = new Date(acquisitionDateStr);
      
      // Cost Movement
      if (acquisitionDate < startOfYear) {
        movementMap[className].initialCost += totalCost;
      } else {
        movementMap[className].additions += totalCost;
      }

      // Depreciation Calculation
      const usefulLifeYears = Number(asset.usefulLife || 0);
      const depreciationStartStr = asset.availabilityDate || asset.startDate;
      
      if (usefulLifeYears > 0 && depreciationStartStr) {
        const depStart = new Date(depreciationStartStr);
        const residualValue = Number(asset.residualValue || 0);
        const depreciableAmount = Math.max(0, totalCost - residualValue);
        const monthlyDepreciation = depreciableAmount / (usefulLifeYears * 12);

        // Initial Accumulated Depreciation (up to Dec 31 of previous year)
        let monthsPrior = (startOfYear.getFullYear() - depStart.getFullYear()) * 12 + (startOfYear.getMonth() - depStart.getMonth());
        if (monthsPrior < 0) monthsPrior = 0;
        monthsPrior = Math.min(monthsPrior, usefulLifeYears * 12);
        
        movementMap[className].initialDepreciation += monthsPrior * monthlyDepreciation;

        // Period Depreciation (YTD)
        const periodStart = depStart > startOfYear ? depStart : startOfYear;
        // Calculate months from periodStart to now
        let monthsInPeriod = (now.getFullYear() - periodStart.getFullYear()) * 12 + (now.getMonth() - periodStart.getMonth());
        if (monthsInPeriod < 0) monthsInPeriod = 0;
        
        const remainingLife = Math.max(0, (usefulLifeYears * 12) - monthsPrior);
        monthsInPeriod = Math.min(monthsInPeriod, remainingLife);

        movementMap[className].periodDepreciation += monthsInPeriod * monthlyDepreciation;
      }
    });

    return Object.entries(movementMap).map(([name, data]) => ({
      name,
      ...data,
      finalCost: data.initialCost + data.additions,
      finalDepreciation: data.initialDepreciation + data.periodDepreciation,
      netValue: (data.initialCost + data.additions) - (data.initialDepreciation + data.periodDepreciation)
    })).sort((a, b) => b.finalCost - a.finalCost);
  }, [assets, expenses]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Button 
          variant="outline" 
          onClick={() => setViewMode(prev => (prev === 'budget' ? 'assets' : 'budget'))}
          className="p-2 h-auto rounded-full transition-all duration-300 hover:shadow-md group border-slate-200 hover:border-blue-300 hover:bg-blue-50/30"
          title="Alternar Visão (Budget -> Ativos)"
        >
          <div className="animate-bounce">
            <img 
              src="/oba.svg" 
              alt="Alternar Visão" 
              className={`w-12 h-12 transition-all duration-700 ease-in-out group-hover:scale-110 ${viewMode !== 'budget' ? 'rotate-[360deg]' : 'rotate-0'}`} 
            />
          </div>
        </Button>
        <h1 className="text-3xl font-bold text-slate-700">
          {viewMode === 'budget' ? 'Dashboard: Controle Orçamentário' : 'Dashboard: Gestão de Ativos'}
        </h1>
      </div>

      {/* Seção Controle de Budget (FP&A) */}
      {viewMode === 'budget' && budgetMetrics && (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-emerald-100 rounded-lg">
                    <Target className="w-6 h-6 text-emerald-700" />
                </div>
                <div>
                    <h2 className="text-xl font-semibold text-slate-700">Controle Orçamentário (Budget)</h2>
                    <p className="text-sm text-slate-500">Visão consolidada de execução e desvios</p>
                </div>
            </div>

            {/* KPIs Principais */}
            <div className="grid md:grid-cols-4 gap-4">
                <Card className="border-l-4 border-l-blue-500 shadow-sm py-3 gap-1">
                    <CardHeader className="pb-0">
                        <CardTitle className="text-sm font-medium text-slate-500 flex justify-between">
                            Orçamento Total
                            <Wallet className="h-4 w-4 text-blue-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-800">{formatCurrency(budgetMetrics.totalBudget)}</div>
                        <p className="text-xs text-muted-foreground mt-1">Planejado para o período</p>
                    </CardContent>
                </Card>
                <Card className={`border-l-4 shadow-sm py-3 gap-1 ${budgetMetrics.consumptionPct > 95 ? 'border-l-red-500' : budgetMetrics.consumptionPct > 80 ? 'border-l-yellow-500' : 'border-l-green-500'}`}>
                    <CardHeader className="pb-0">
                        <CardTitle className="text-sm font-medium text-slate-500 flex justify-between">
                            Realizado Acumulado
                            <Activity className="h-4 w-4 text-slate-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-800">{formatCurrency(budgetMetrics.totalRealized)}</div>
                        <div className="flex items-center gap-2 mt-1">
                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full ${budgetMetrics.consumptionPct > 100 ? 'bg-red-500' : 'bg-blue-600'}`} 
                                    style={{ width: `${Math.min(budgetMetrics.consumptionPct, 100)}%` }} 
                                />
                            </div>
                            <span className={`text-xs font-bold ${budgetMetrics.consumptionPct > 95 ? 'text-red-600' : 'text-slate-600'}`}>
                                {budgetMetrics.consumptionPct.toFixed(1)}%
                            </span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-purple-500 shadow-sm py-3 gap-1">
                    <CardHeader className="pb-0">
                        <CardTitle className="text-sm font-medium text-slate-500 flex justify-between">
                            Saldo Disponível
                            <TrendingDown className="h-4 w-4 text-purple-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${budgetMetrics.deviation < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatCurrency(budgetMetrics.deviation)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {budgetMetrics.deviation < 0 ? 'Orçamento estourado' : 'Dentro do limite'}
                        </p>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-orange-500 shadow-sm py-3 gap-1">
                    <CardHeader className="pb-0">
                        <CardTitle className="text-sm font-medium text-slate-500 flex justify-between">
                            Run Rate (Projeção)
                            <TrendingUp className="h-4 w-4 text-orange-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-800">{formatCurrency(budgetMetrics.runRate)}</div>
                        <p className="text-xs text-muted-foreground mt-1">Baseado no Burn Rate mensal de {formatCurrency(budgetMetrics.burnRate)}</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                {/* Gráfico de Evolução Mensal */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg font-semibold text-slate-700">Execução Orçamentária Mensal (Planejado vs Realizado)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={budgetMetrics.monthlyEvolution}
                                    margin={{
                                        top: 60,
                                        right: 30,
                                        left: 20,
                                        bottom: 5,
                                    }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis 
                                        dataKey="name" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: '#64748b', fontSize: 14 }} 
                                    />
                                    <YAxis 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: '#64748b', fontSize: 14 }} 
                                        tickFormatter={(value) => new Intl.NumberFormat('pt-BR', { notation: "compact", compactDisplay: "short" }).format(value)} 
                                    />
                                    <RechartsTooltip
                                        cursor={{ fill: '#f1f5f9' }}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        formatter={(value: number) => formatCurrency(value)}
                                    />
                                    <Legend 
                                        wrapperStyle={{ paddingTop: '20px' }}
                                        payload={[
                                            { value: 'Planejado', type: 'rect', color: '#cbd5e1' },
                                            { value: 'Realizado', type: 'rect', color: '#3b82f6' },
                                            { value: 'Acima do Budget', type: 'rect', color: '#ef4444' }
                                        ]}
                                    />
                                    <Bar dataKey="budget" name="Planejado" fill="#cbd5e1" radius={[4, 4, 0, 0]}>
                                        <LabelList 
                                            dataKey="budget" 
                                            position="top" 
                                            angle={-90}
                                            offset={10}
                                            formatter={(value: number) => value > 0 ? Math.round(value).toLocaleString('pt-BR') : ''} 
                                            style={{ fill: '#94a3b8', fontSize: 12, textAnchor: 'start' }} 
                                        />
                                    </Bar>
                                    <Bar dataKey="realized" name="Realizado" radius={[4, 4, 0, 0]}>
                                        {budgetMetrics.monthlyEvolution.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.realized > entry.budget ? '#ef4444' : '#3b82f6'} />
                                        ))}
                                        <LabelList 
                                            dataKey="realized" 
                                            position="top" 
                                            angle={-90}
                                            offset={10}
                                            formatter={(value: number) => value > 0 ? Math.round(value).toLocaleString('pt-BR') : ''} 
                                            style={{ fill: '#475569', fontSize: 12, fontWeight: 600, textAnchor: 'start' }} 
                                        />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Gráfico de Orçamento por Status */}
                <Card className="md:col-span-1">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg font-semibold text-slate-700">Obras por Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[350px] w-full relative">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={budgetMetrics.projectsByStatus}
                                        cx="50%"
                                        cy="45%"
                                        innerRadius={80}
                                        outerRadius={110}
                                        paddingAngle={5}
                                        dataKey="value"
                                        label={({ value }) => value}
                                    >
                                        {budgetMetrics.projectsByStatus.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || '#94a3b8'} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip 
                                        formatter={(value: number) => value}
                                        contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                                    />
                                    <Legend layout="horizontal" verticalAlign="bottom" align="center" formatter={(value, entry: any) => <span className="text-xs text-slate-600 ml-1">{budgetMetrics.projectsByStatus.find(i => i.name === value)?.displayName || value}</span>} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute top-[45%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center bg-white/90 w-24 h-24 rounded-full shadow-sm border border-slate-100 pointer-events-none z-10">
                                <span className="text-3xl font-bold text-slate-700">{projects?.length || 0}</span>
                                <span className="text-xs text-slate-500 font-medium uppercase">Obras</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Tabela de Centros de Custo */}
                <Card className="md:col-span-1 overflow-hidden flex flex-col">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg font-semibold text-slate-700">Performance por Centro de Custo</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-auto p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-sm">Centro de Custo</TableHead>
                                    <TableHead className="text-sm text-right">Consumo</TableHead>
                                    <TableHead className="text-sm text-center">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {budgetMetrics.costCenters.map((cc) => (
                                    <TableRow key={cc.name}>
                                        <TableCell className="text-sm font-medium">{cc.name}</TableCell>
                                        <TableCell className="text-sm text-right">{cc.pct.toFixed(0)}%</TableCell>
                                        <TableCell className="text-center">
                                            <div className={`w-3 h-3 rounded-full mx-auto ${cc.status === 'verde' ? 'bg-green-500' : cc.status === 'amarelo' ? 'bg-yellow-400' : 'bg-red-500'}`} title={cc.status} />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
      )}

      {/* Seção Imobilizado */}
      {viewMode === 'assets' && (
      <div className="space-y-4 animate-in fade-in duration-500">
        <div className="flex items-center gap-2">
            <div className="p-2 bg-orange-100 rounded-lg">
                <Package className="w-6 h-6 text-orange-600" />
            </div>
            <h2 className="text-xl font-semibold text-slate-700">Gestão do Imobilizado (Ativos)</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                    <Card className="bg-gradient-to-br from-white to-slate-50 py-3 gap-1 shadow-sm">
                        <CardHeader className="pb-0">
                            <CardTitle className="text-sm font-medium text-slate-500">Valor Total em Ativos</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-slate-800">{formatCurrency(totalAssetsValue)}</div>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium flex items-center">
                                    <ArrowUpRight className="w-3 h-3 mr-1" /> Ativos
                                </span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="py-3 gap-1 shadow-sm">
                        <CardHeader className="pb-0">
                            <CardTitle className="text-sm font-medium text-slate-500">Status dos Ativos</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex justify-between items-end mb-1">
                                <div>
                                    <span className="text-2xl font-bold text-slate-700">{totalAssets}</span>
                                    <span className="text-xs text-muted-foreground ml-2">Total</span>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px]">
                                    <span className="text-slate-600">Concluídos</span>
                                    <span className="font-medium">{assetsCompleted}</span>
                                </div>
                                <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                                    <div className="bg-green-500 h-full" style={{ width: `${totalAssets > 0 ? (assetsCompleted/totalAssets)*100 : 0}%` }} />
                                </div>
                                <div className="flex justify-between text-[10px]">
                                    <span className="text-slate-600">Em Andamento</span>
                                    <span className="font-medium">{assetsInProgress}</span>
                                </div>
                                <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                                    <div className="bg-yellow-500 h-full" style={{ width: `${totalAssets > 0 ? (assetsInProgress/totalAssets)*100 : 0}%` }} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg font-semibold text-slate-700">Depreciação Mensal ({new Date().getFullYear()})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[200px] w-full flex items-end justify-between gap-2 pt-8 pb-2">
                            {monthlyDepreciationData.map((item) => {
                                const maxValue = Math.max(...monthlyDepreciationData.map(d => d.value), 1);
                                const heightPercentage = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
                                
                                return (
                                    <div key={item.name} className="flex flex-col items-center gap-2 w-full group h-full justify-end">
                                        <div className="relative w-full bg-slate-50 rounded-t-sm flex items-end justify-center h-full">
                                            <div 
                                                className="w-full mx-1 bg-blue-500 hover:bg-blue-600 transition-all duration-500 rounded-t-sm relative group-hover:shadow-lg"
                                                style={{ height: `${heightPercentage}%` }}
                                            >
                                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 text-[10px] text-slate-600 font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity">
                                                    {item.value > 0 && formatCurrency(item.value)}
                                                </div>
                                            </div>
                                        </div>
                                        <span className="text-[10px] text-slate-500 font-medium uppercase">{item.name}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="md:col-span-1">
            <Card className="h-full flex flex-col">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-semibold text-slate-700">Distribuição por Classe (Custo)</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 min-h-[350px]">
                    <div className="h-full w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={assetClassesData.slice(0, 6)}>
                                <PolarGrid stroke="#cbd5e1" />
                                <PolarAngleAxis dataKey="name" tick={{ fill: '#475569', fontSize: 14, fontWeight: 500 }} tickFormatter={(val) => val.split(' ')[0]} />
                                <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(value) => new Intl.NumberFormat('pt-BR', { notation: "compact" }).format(value)} />
                                <Radar name="Custo" dataKey="cost" stroke="#09c357" fill="#09c357" fillOpacity={0.7} />
                                <RechartsTooltip 
                                    formatter={(value: number) => formatCurrency(value)}
                                    contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    itemStyle={{ color: '#ea580c', fontWeight: 600 }}
                                />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>
            </div>
        </div>

        {/* Quadro de Movimentação */}
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold text-slate-700">Quadro de Movimentação do Imobilizado (YTD)</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Classe</TableHead>
                                <TableHead className="text-right">Saldo Inicial (Custo)</TableHead>
                                <TableHead className="text-right">Adições</TableHead>
                                <TableHead className="text-right">Saldo Final (Custo)</TableHead>
                                <TableHead className="text-right">Deprec. Acum. Inicial</TableHead>
                                <TableHead className="text-right">Deprec. Período</TableHead>
                                <TableHead className="text-right">Deprec. Acum. Final</TableHead>
                                <TableHead className="text-right">Valor Líquido</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {assetMovementData.map((item) => (
                                <TableRow key={item.name}>
                                    <TableCell className="font-medium whitespace-nowrap">{item.name}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(item.initialCost)}</TableCell>
                                    <TableCell className="text-right text-blue-600">+{formatCurrency(item.additions)}</TableCell>
                                    <TableCell className="text-right font-medium">{formatCurrency(item.finalCost)}</TableCell>
                                    <TableCell className="text-right text-slate-500">{formatCurrency(item.initialDepreciation)}</TableCell>
                                    <TableCell className="text-right text-red-500">-{formatCurrency(item.periodDepreciation)}</TableCell>
                                    <TableCell className="text-right text-slate-500">{formatCurrency(item.finalDepreciation)}</TableCell>
                                    <TableCell className="text-right font-bold text-slate-800">{formatCurrency(item.netValue)}</TableCell>
                                </TableRow>
                            ))}
                            {assetMovementData.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                                        Nenhum dado de movimentação disponível.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>

        {/* Tabela e Gráficos por Classe */}
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold text-slate-700">Análise por Classe Contábil</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Classe do Ativo</TableHead>
                                <TableHead className="text-center">Qtd</TableHead>
                                <TableHead className="text-right">Valor de Custo</TableHead>
                                <TableHead className="text-right">Depreciação Acum.</TableHead>
                                <TableHead className="text-right">Valor Residual</TableHead>
                                <TableHead className="w-[200px]">Composição (Deprec. vs Residual)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {assetClassesData.map((item) => (
                                <TableRow key={item.name}>
                                    <TableCell className="font-medium">{item.name}</TableCell>
                                    <TableCell className="text-center">{item.count}</TableCell>
                                    <TableCell className="text-right font-medium">{formatCurrency(item.cost)}</TableCell>
                                    <TableCell className="text-right text-red-600">
                                        {formatCurrency(item.depreciation)}
                                    </TableCell>
                                    <TableCell className="text-right text-green-600 font-bold">
                                        {formatCurrency(item.residual)}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            <div className="flex h-2 w-full rounded-full overflow-hidden bg-slate-100">
                                                <div 
                                                    className="bg-red-400" 
                                                    style={{ width: `${item.cost > 0 ? (item.depreciation / item.cost) * 100 : 0}%` }} 
                                                    title={`Depreciação: ${((item.depreciation / item.cost) * 100).toFixed(1)}%`}
                                                />
                                                <div 
                                                    className="bg-green-500" 
                                                    style={{ width: `${item.cost > 0 ? (item.residual / item.cost) * 100 : 0}%` }} 
                                                    title={`Residual: ${((item.residual / item.cost) * 100).toFixed(1)}%`}
                                                />
                                            </div>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {assetClassesData.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                                        Nenhum dado de classe disponível.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
      </div>
      )}
    </div>
  );
}
