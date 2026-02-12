import React, { useState, useMemo, useEffect } from 'react';
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Activity, AlertTriangle, Play, Pause, ChevronDown, ChevronRight, ChevronLeft, Calendar, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, doc, writeBatch, updateDoc } from "firebase/firestore";
import { Progress } from "@/components/ui/progress";

interface DepreciationData {
  assetId: string;
  assetName: string;
  assetNumber: string;
  depreciationStatus: 'active' | 'paused';
  assetValue: number;
  residualValue: number;
  accumulatedDepreciation: number;
  usefulLife: number; // in months
  monthlyDepreciation: number;
  depreciationStartDate: Date;
  depreciationEndDate: Date;
  monthlyBreakdown: { month: string; dateStr: string; depreciation: number; accumulated: number; bookValue: number }[];
}

const MONTH_LABELS = ['JAN.', 'FEV.', 'MAR.', 'ABR.', 'MAI.', 'JUN.', 'JUL.', 'AGO.', 'SET.', 'OUT.', 'NOV.', 'DEZ.'];

export default function AssetDepreciationPage() {
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  const [assets, setAssets] = useState<any[]>([]);
  const [assetClasses, setAssetClasses] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [isLoadingClasses, setIsLoadingAssetClasses] = useState(true);
  const [isLoadingExpenses, setIsLoadingExpenses] = useState(true);
  const [filterMonth, setFilterMonth] = useState("");
  const [displayYear, setDisplayYear] = useState(new Date().getFullYear());
  const [expandedClasses, setExpandedClasses] = useState<Record<string, boolean>>({});
  const [isFiscalExpanded, setIsFiscalExpanded] = useState(false);
  const [isCorporateExpanded, setIsCorporateExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<'realized' | 'projected'>('realized');
  const [useAcquisitionMonth, setUseAcquisitionMonth] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "assets"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAssets(data);
      setIsLoadingAssets(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "asset_classes"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAssetClasses(data);
      setIsLoadingAssetClasses(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "expenses"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setExpenses(data);
      setIsLoadingExpenses(false);
    });
    return () => unsubscribe();
  }, []);

  const isLoading = isLoadingAssets || isLoadingExpenses || isLoadingClasses;

  const getLocalDateFromISO = (isoString: string) => {
    if (!isoString) return new Date();
    // Handle YYYY-MM-DD string manually to avoid timezone issues
    if (isoString.length === 10 && isoString.includes('-')) {
        const [y, m, d] = isoString.split('-').map(Number);
        return new Date(y, m - 1, d);
    }
    const date = new Date(isoString);
    // Use local time to match UI display (e.g. 31/12/2025) and avoid UTC shifts to next month
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  };

  const getAssetValue = (asset: any) => {
    const assetExpenses = expenses.filter(e => String(e.assetId) === String(asset.id));
    const expensesTotal = assetExpenses.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    return Number(asset.value || 0) + expensesTotal;
  };

  const depreciationData = useMemo((): DepreciationData | null => {
    if (!selectedAssetId || !assets) return null;

    const asset = assets.find(a => a.id === selectedAssetId);
    
    const dateToUse = asset?.availabilityDate || asset?.startDate;
    if (!asset || !dateToUse) return null;

    const assetValue = getAssetValue(asset);
    const accumulatedDepreciation = Number(asset.accumulatedDepreciation || 0);
    const residualValue = Number(asset.residualValue || 0);
    
    const assetClassDef = assetClasses.find(c => c.name === asset.assetClass);
    const effectiveUsefulLife = Number(asset.usefulLife) || Number(assetClassDef?.usefulLife) || 0;
    const usefulLifeInMonths = effectiveUsefulLife * 12;
    const depreciableValue = assetValue - residualValue;
    
    if (usefulLifeInMonths <= 0) return null;

    const monthlyDepreciation = depreciableValue / usefulLifeInMonths;
    const depreciationStartDate = getLocalDateFromISO(dateToUse);
    
    // Set start date to the beginning of the next month
    depreciationStartDate.setMonth(depreciationStartDate.getMonth() + 1, 1);


    const depreciationEndDate = new Date(depreciationStartDate);
    depreciationEndDate.setMonth(depreciationEndDate.getMonth() + usefulLifeInMonths);

    const monthlyBreakdown: { month: string; dateStr: string; depreciation: number; accumulated: number; bookValue: number }[] = [];
    let accumulated = 0;
    let currentBookValue = assetValue;

    for (let i = 0; i < usefulLifeInMonths; i++) {
      const currentDate = new Date(depreciationStartDate);
      currentDate.setMonth(currentDate.getMonth() + i);
      
      accumulated += monthlyDepreciation;
      currentBookValue -= monthlyDepreciation;

      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');

      monthlyBreakdown.push({
        month: currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
        dateStr: `${year}-${month}`,
        depreciation: monthlyDepreciation,
        accumulated: accumulated,
        bookValue: currentBookValue,
      });
    }

    return {
      assetId: asset.id,
      assetName: asset.name,
      assetNumber: (asset as any).assetNumber,
      depreciationStatus: asset.depreciationStatus || 'active',
      assetValue,
      residualValue,
      accumulatedDepreciation,
      usefulLife: usefulLifeInMonths,
      monthlyDepreciation,
      depreciationStartDate,
      depreciationEndDate,
      monthlyBreakdown,
    };
  }, [assets, selectedAssetId, expenses, assetClasses]);

  const handleResetAsset = async () => {
    if (!selectedAssetId) return;
    if (!confirm("Tem certeza? Isso zerará a depreciação acumulada e a data da última execução deste ativo, permitindo recalcular desde o início.")) return;
    
    try {
        await updateDoc(doc(db, "assets", selectedAssetId), {
            accumulatedDepreciation: 0,
            lastDepreciationDate: null
        });
        toast.success("Ativo resetado com sucesso.");
    } catch (error) {
        toast.error("Erro ao resetar ativo.");
    }
  };

  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const [runMonth, setRunMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState("");
  const [previewAssets, setPreviewAssets] = useState<any[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const toggleClass = (className: string) => {
    setExpandedClasses(prev => ({ ...prev, [className]: !prev[className] }));
  };

  const selectedYear = displayYear;

  const calculateYearlyDepreciation = (asset: any, year: number, type: 'fiscal' | 'corporate' = 'fiscal') => {
    const dateToUse = asset.availabilityDate || asset.startDate;
    if (!dateToUse) return Array(12).fill({ val: 0, planned: 0, realized: 0, isCalculated: false });
    if (asset.depreciationStatus === 'paused') return Array(12).fill({ val: 0, planned: 0, realized: 0, isCalculated: false });

    const assetValue = getAssetValue(asset);
    const residualValue = Number(asset.residualValue || 0);
    
    const assetClassDef = assetClasses.find(c => c.name === asset.assetClass);
    
    let effectiveUsefulLife = 0;
    if (type === 'corporate') {
        effectiveUsefulLife = Number(asset.corporateUsefulLife) || Number(assetClassDef?.corporateUsefulLife) || 0;
    } else {
        effectiveUsefulLife = Number(asset.usefulLife) || Number(assetClassDef?.usefulLife) || 0;
    }

    const usefulLifeInMonths = effectiveUsefulLife * 12;
    const depreciableValue = assetValue - residualValue;

    if (usefulLifeInMonths <= 0 || depreciableValue <= 0) return Array(12).fill({ val: 0, planned: 0, realized: 0, isCalculated: false });

    const monthlyDepreciation = depreciableValue / usefulLifeInMonths;
    
    const depreciationStartDate = getLocalDateFromISO(dateToUse);
    depreciationStartDate.setMonth(depreciationStartDate.getMonth() + 1, 1);
    
    const depreciationEndDate = new Date(depreciationStartDate);
    depreciationEndDate.setMonth(depreciationEndDate.getMonth() + usefulLifeInMonths);

    const lastRunDate = asset.lastDepreciationDate ? new Date(asset.lastDepreciationDate) : null;

    const results = [];
    for (let i = 0; i < 12; i++) {
        const currentMonthDate = new Date(year, i, 1);
        const isActive = currentMonthDate >= depreciationStartDate && currentMonthDate < depreciationEndDate;
        
        let isCalculated = false;
        if (lastRunDate) {
            const lastRunMonthStart = new Date(lastRunDate.getFullYear(), lastRunDate.getMonth(), 1);
            if (currentMonthDate <= lastRunMonthStart) isCalculated = true;
        }

        const planned = isActive ? monthlyDepreciation : 0;
        const realized = (isActive && isCalculated) ? monthlyDepreciation : 0;

        results.push({
            val: (isActive && (isCalculated || viewMode === 'projected')) ? monthlyDepreciation : 0,
            planned,
            realized,
            isCalculated: isActive && isCalculated
        });
    }
    return results;
  };

  const classSummaryFiscal = useMemo(() => {
      const groups: Record<string, { totalYear: number, monthlyTotals: number[], monthlyPlanned: number[], monthlyRealized: number[], assets: any[] }> = {};
      
      assetClasses.forEach((cls: any) => {
        if (cls.name) {
          groups[cls.name] = { totalYear: 0, monthlyTotals: Array(12).fill(0), monthlyPlanned: Array(12).fill(0), monthlyRealized: Array(12).fill(0), assets: [] };
        }
      });

      assets.forEach(asset => {
          const yearlyData = calculateYearlyDepreciation(asset, selectedYear, 'fiscal');
          const cls = asset.assetClass || "Sem Classe";
          
          if (!groups[cls]) groups[cls] = { totalYear: 0, monthlyTotals: Array(12).fill(0), monthlyPlanned: Array(12).fill(0), monthlyRealized: Array(12).fill(0), assets: [] };
          
          const assetTotal = yearlyData.reduce((acc, item) => acc + item.val, 0);
          
          groups[cls].assets.push({ ...asset, yearlyData, assetTotal });
          
          yearlyData.forEach((item, idx) => {
              groups[cls].monthlyTotals[idx] += item.val;
              groups[cls].monthlyPlanned[idx] += item.planned;
              groups[cls].monthlyRealized[idx] += item.realized;
          });
          groups[cls].totalYear += assetTotal;
      });

      return Object.entries(groups).map(([name, data]) => ({ name, ...data }));
  }, [assets, displayYear, assetClasses, expenses, viewMode]);

  const classSummaryCorporate = useMemo(() => {
      const groups: Record<string, { totalYear: number, monthlyTotals: number[], monthlyPlanned: number[], monthlyRealized: number[], assets: any[] }> = {};
      
      assetClasses.forEach((cls: any) => {
        if (cls.name) {
          groups[cls.name] = { totalYear: 0, monthlyTotals: Array(12).fill(0), monthlyPlanned: Array(12).fill(0), monthlyRealized: Array(12).fill(0), assets: [] };
        }
      });

      assets.forEach(asset => {
          const yearlyData = calculateYearlyDepreciation(asset, selectedYear, 'corporate');
          const cls = asset.assetClass || "Sem Classe";
          
          if (!groups[cls]) groups[cls] = { totalYear: 0, monthlyTotals: Array(12).fill(0), monthlyPlanned: Array(12).fill(0), monthlyRealized: Array(12).fill(0), assets: [] };
          
          const assetTotal = yearlyData.reduce((acc, item) => acc + item.val, 0);
          
          groups[cls].assets.push({ ...asset, yearlyData, assetTotal });
          
          yearlyData.forEach((item, idx) => {
              groups[cls].monthlyTotals[idx] += item.val;
              groups[cls].monthlyPlanned[idx] += item.planned;
              groups[cls].monthlyRealized[idx] += item.realized;
          });
          groups[cls].totalYear += assetTotal;
      });

      return Object.entries(groups).map(([name, data]) => ({ name, ...data }));
  }, [assets, displayYear, assetClasses, expenses, viewMode]);

  const fiscalTotals = useMemo(() => {
    const monthly = Array(12).fill(0);
    const monthlyPlanned = Array(12).fill(0);
    const monthlyRealized = Array(12).fill(0);
    let total = 0;
    classSummaryFiscal.forEach(group => {
      group.monthlyTotals.forEach((val, idx) => monthly[idx] += val);
      group.monthlyPlanned.forEach((val, idx) => monthlyPlanned[idx] += val);
      group.monthlyRealized.forEach((val, idx) => monthlyRealized[idx] += val);
      total += group.totalYear;
    });
    return { monthly, monthlyPlanned, monthlyRealized, total };
  }, [classSummaryFiscal]);

  const corporateTotals = useMemo(() => {
    const monthly = Array(12).fill(0);
    const monthlyPlanned = Array(12).fill(0);
    const monthlyRealized = Array(12).fill(0);
    let total = 0;
    classSummaryCorporate.forEach(group => {
      group.monthlyTotals.forEach((val, idx) => monthly[idx] += val);
      group.monthlyPlanned.forEach((val, idx) => monthlyPlanned[idx] += val);
      group.monthlyRealized.forEach((val, idx) => monthlyRealized[idx] += val);
      total += group.totalYear;
    });
    return { monthly, monthlyPlanned, monthlyRealized, total };
  }, [classSummaryCorporate]);

  const checkPendingCalculations = () => {
    const [year, month] = runMonth.split('-').map(Number);
    const targetDate = new Date(year, month, 0); // Last day of the target month
    const targetMonthStart = new Date(year, month - 1, 1);

    // Broaden filter to include paused assets for visibility
    const assetsToProcess = assets?.filter(a => 
        a.status && a.status.toLowerCase() === 'concluido'
    ) || [];

    const pending = [];

    for (const asset of assetsToProcess) {
        const dateToUse = asset.availabilityDate || asset.startDate;
        if (!dateToUse) continue;

        const assetValue = getAssetValue(asset);
        const residualValue = Number(asset.residualValue || 0);
        
        const assetClassDef = assetClasses.find(c => c.name === asset.assetClass);
        const effectiveUsefulLife = Number(asset.usefulLife) || Number(assetClassDef?.usefulLife) || 0;
        const usefulLifeInMonths = effectiveUsefulLife * 12;
        const depreciableValue = assetValue - residualValue;
        
        const depreciationStartDate = getLocalDateFromISO(dateToUse);
        
        if (!useAcquisitionMonth) {
            depreciationStartDate.setMonth(depreciationStartDate.getMonth() + 1, 1);
        } else {
            depreciationStartDate.setDate(1);
        }
        // Ensure day is 1
        depreciationStartDate.setDate(1);

        const depreciationEndDate = new Date(depreciationStartDate);
        depreciationEndDate.setMonth(depreciationEndDate.getMonth() + usefulLifeInMonths);

        let isRecalculation = false;
        let isFutureRun = false;

        // Check if already run for this period or future
        if (asset.lastDepreciationDate) {
            const lastRun = new Date(asset.lastDepreciationDate);
            // Compare YYYY-MM to avoid timezone day shifts issues at end of month
            const lastRunStr = `${lastRun.getFullYear()}-${String(lastRun.getMonth() + 1).padStart(2, '0')}`;
            const targetStr = `${year}-${String(month).padStart(2, '0')}`;
            if (lastRunStr > targetStr) isFutureRun = true;
            if (lastRunStr === targetStr) isRecalculation = true;
        }

        let error = null;
        if (asset.depreciationStatus === 'paused') error = "Cálculo Pausado";
        else if (usefulLifeInMonths <= 0) error = "Vida útil não definida";
        else if (depreciableValue <= 0) error = "Valor depreciável zero";
        else if (isFutureRun) error = "Mês posterior já processado";
        else if (targetDate < depreciationStartDate) {
             error = `Inicia em ${depreciationStartDate.toLocaleDateString('pt-BR')}`;
        }
        else if (targetMonthStart >= depreciationEndDate) {
             error = `Finalizou em ${depreciationEndDate.toLocaleDateString('pt-BR')}`;
        }
        
        // Calculate total months elapsed from start to target date for self-healing
        const totalMonthsElapsed = (targetDate.getFullYear() - depreciationStartDate.getFullYear()) * 12 + (targetDate.getMonth() - depreciationStartDate.getMonth()) + 1;

        pending.push({
            ...asset,
            monthsToProcess: 1,
            depreciableValue,
            usefulLifeInMonths,
            depreciationStartDate, // Pass for display
            error,
            isRecalculation,
            totalMonthsElapsed
        });
    }

    setPreviewAssets(pending);
    setShowPreview(true);
  };

  const handleConfirmRun = async () => {
    setIsRunning(true);
    setProgress(0);
    setProcessingStatus("Iniciando análise...");

    try {
        const [year, month] = runMonth.split('-').map(Number);
        const targetDate = new Date(year, month, 0); // Last day of the target month

        const batch = writeBatch(db);
        let assetsProcessed = 0;

        const totalAssets = previewAssets.length;

        for (let i = 0; i < totalAssets; i++) {
            const item = previewAssets[i];
            
            // Atualiza progresso visual
            const currentProgress = Math.round(((i + 1) / totalAssets) * 100);
            setProgress(currentProgress);
            setProcessingStatus(`Processando: ${item.name}`);
            await new Promise(resolve => setTimeout(resolve, 10)); // Pequeno delay para renderização

            const { monthsToProcess, depreciableValue, usefulLifeInMonths, accumulatedDepreciation: currentAccumulatedStr, totalMonthsElapsed, isRecalculation } = item;

            if (item.error) continue; // Skip items with errors

            const monthlyAmount = depreciableValue / usefulLifeInMonths;
            const currentAccumulated = Number(currentAccumulatedStr || 0);
            const totalForPeriod = monthlyAmount * monthsToProcess;
            
            let newAccumulated = 0;
            
            if (isRecalculation && totalMonthsElapsed > 0) {
                // Self-Healing: If recalculating, force the value to the correct straight-line amount for the target date.
                // This fixes issues where previous runs were 0 or incorrect, and prevents double-counting.
                newAccumulated = Math.min(depreciableValue, monthlyAmount * totalMonthsElapsed);
            } else {
                newAccumulated = currentAccumulated + totalForPeriod;
            }

            if (newAccumulated > depreciableValue) {
                newAccumulated = depreciableValue;
            }
            
            // Allow update if value changed (even if it decreased, to correct errors) or if it increased
            if (Math.abs(newAccumulated - currentAccumulated) > 0.01) {
                const assetRef = doc(db, "assets", item.id);
                batch.update(assetRef, {
                    accumulatedDepreciation: newAccumulated,
                    lastDepreciationDate: targetDate.toISOString(),
                });
                assetsProcessed++;
            }
        }

        setProcessingStatus("Salvando alterações...");
        if (assetsProcessed > 0) {
            await batch.commit();
            toast.success(`${assetsProcessed} ativos foram processados com sucesso!`);
        } else {
            toast.info("Nenhum ativo precisava de atualização para o período selecionado.");
        }

    } catch (error) {
        console.error("Erro ao rodar cálculos:", error);
        toast.error("Ocorreu um erro durante o processo.");
    } finally {
        setTimeout(() => {
            setIsRunning(false);
            setIsRunModalOpen(false);
            setShowPreview(false);
            setPreviewAssets([]);
        }, 500);
    }
  };

  const toggleDepreciationStatus = async () => {
    if (!depreciationData) return;

    const newStatus = depreciationData.depreciationStatus === 'active' ? 'paused' : 'active';

    try {
        const assetRef = doc(db, "assets", depreciationData.assetId);
        await updateDoc(assetRef, { depreciationStatus: newStatus });
        toast.success(`Cálculo ${newStatus === 'paused' ? 'pausado' : 'reativado'} para o ativo.`);
    } catch (error) {
        toast.error("Erro ao alterar status do cálculo.");
    }
  };

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xl font-bold">Cálculos de Depreciação e Amortização</CardTitle>
          <Dialog open={isRunModalOpen} onOpenChange={setIsRunModalOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700" disabled={isLoading} onClick={() => {
                setShowPreview(false);
                setPreviewAssets([]);
              }}>
                <Activity className="mr-2 h-4 w-4" /> Rodar Cálculo Mensal
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Executar Cálculos de Depreciação/Amortização</DialogTitle>
                <DialogDescription>
                  {isRunning 
                    ? "Aguarde enquanto o sistema processa os cálculos..." 
                    : showPreview 
                        ? "Confirme os ativos que serão atualizados."
                        : "Selecione o mês de referência para verificar pendências."}
                </DialogDescription>
              </DialogHeader>
              
              {isRunning ? (
                <div className="py-8 space-y-6">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <div className="relative">
                       <Activity className="h-12 w-12 text-blue-600 animate-pulse" />
                    </div>
                    <div className="space-y-2 w-full px-4">
                      <div className="flex justify-between text-xs text-muted-foreground">
                         <span>Progresso</span>
                         <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                      <p className="text-sm text-center text-muted-foreground min-h-[20px] animate-pulse">{processingStatus}</p>
                    </div>
                  </div>
                </div>
              ) : !showPreview ? (
                <div className="py-4 space-y-4">
                  <label htmlFor="run-month">Mês de Referência</label>
                  <div className="flex gap-2">
                    <Input
                      id="run-month"
                      type="month"
                      value={runMonth}
                      onChange={(e) => setRunMonth(e.target.value)}
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => {
                        const now = new Date();
                        setRunMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
                      }}
                      title="Mês Atual"
                    >
                      <Calendar className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center space-x-2 border p-3 rounded-md bg-slate-50">
                    <Checkbox 
                        id="use-acquisition" 
                        checked={useAcquisitionMonth}
                        onCheckedChange={(c) => setUseAcquisitionMonth(!!c)}
                    />
                    <Label htmlFor="use-acquisition" className="text-sm font-medium cursor-pointer">
                        Considerar mês de aquisição (iniciar no mesmo mês)
                    </Label>
                  </div>
                  <div className="flex items-start gap-2 p-3 text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-md">
                    <AlertTriangle size={24} className="mt-1 flex-shrink-0" />
                    <span>
                      O sistema calculará a depreciação referente apenas ao mês selecionado para os ativos elegíveis.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="py-4 space-y-4">
                  <div className="flex items-center gap-2 p-3 text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-md">
                    <AlertTriangle size={24} className="mt-1 flex-shrink-0" />
                    <span>
                      Foram encontrados <strong>{previewAssets.length}</strong> ativos com depreciação pendente para o período.
                    </span>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ativo</TableHead>
                          <TableHead>Início Deprec.</TableHead>
                          <TableHead className="text-right">Valor Total</TableHead>
                          <TableHead className="text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewAssets.map((asset) => {
                           const monthlyVal = asset.usefulLifeInMonths > 0 ? (asset.depreciableValue / asset.usefulLifeInMonths) : 0;
                           const totalVal = monthlyVal * asset.monthsToProcess;
                           return (
                            <TableRow key={asset.id}>
                              <TableCell className="font-medium text-xs">{asset.name}</TableCell>
                              <TableCell className="text-xs">{asset.depreciationStartDate?.toLocaleDateString('pt-BR')}</TableCell>
                              <TableCell className="text-right text-xs">R$ {totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                              <TableCell className="text-right text-xs">
                                {asset.error ? 
                                    <span className="text-red-600 font-bold">{asset.error}</span> : 
                                    asset.isRecalculation ?
                                    <span className="text-orange-600 font-bold">Recálculo</span> :
                                    <span className="text-green-600">Pronto</span>
                                }
                              </TableCell>
                            </TableRow>
                           )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
              
              {!isRunning && (
              <DialogFooter>
                {showPreview ? (
                    <>
                        <Button variant="outline" onClick={() => setShowPreview(false)}>Voltar</Button>
                        <Button onClick={handleConfirmRun} disabled={isRunning || isLoading}>
                            Confirmar e Recalcular
                        </Button>
                    </>
                ) : (
                    <>
                        <Button variant="outline" onClick={() => setIsRunModalOpen(false)}>Cancelar</Button>
                        <Button onClick={checkPendingCalculations} disabled={isRunning || isLoading}>
                            Verificar Pendências
                        </Button>
                    </>
                )}
              </DialogFooter>
              )}
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>

      <Card className="mb-6 border-blue-100 bg-blue-50/30">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setIsFiscalExpanded(!isFiscalExpanded)}>
            {isFiscalExpanded ? <ChevronDown className="h-5 w-5 text-slate-600" /> : <ChevronRight className="h-5 w-5 text-slate-600" />}
            <CardTitle className="text-lg font-bold text-slate-700">Resumo Anual por Classe - Fiscal ({selectedYear})</CardTitle>
          </div>
          <div className="flex items-center bg-slate-100 p-1 rounded-md">
            <button
                onClick={() => setViewMode('realized')}
                className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${viewMode === 'realized' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                Realizado
            </button>
            <button
                onClick={() => setViewMode('projected')}
                className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${viewMode === 'projected' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                Projetado
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600">Ano de Referência:</span>
            <div className="flex items-center gap-1 bg-white border rounded-md p-1">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDisplayYear(y => y - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-bold w-12 text-center">{displayYear}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDisplayYear(y => y + 1)}>
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
          </div>
        </CardHeader>
        {isFiscalExpanded && (
        <CardContent>
          <div className="rounded-md border bg-white overflow-x-auto">
            <Table className="min-w-[1200px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px] sticky left-0 bg-white z-10"></TableHead>
                  <TableHead className="sticky left-[50px] bg-white z-10 min-w-[200px]">Classe do Ativo</TableHead>
                  {MONTH_LABELS.map((month, i) => (
                    <TableHead key={i} className="text-right text-xs px-2">
                      {month}
                    </TableHead>
                  ))}
                  <TableHead className="text-right font-bold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classSummaryFiscal.map((group) => (
                  <React.Fragment key={group.name}>
                    <TableRow className="bg-slate-50 font-medium cursor-pointer hover:bg-slate-100" onClick={() => toggleClass(group.name)}>
                      <TableCell className="sticky left-0 bg-slate-50 z-10">
                        {expandedClasses[group.name] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </TableCell>
                      <TableCell className="sticky left-[50px] bg-slate-50 z-10">
                        {group.name} <span className="text-xs text-muted-foreground font-normal ml-2">({group.assets.length})</span>
                      </TableCell>
                      {group.monthlyTotals.map((total, idx) => {
                        const isComplete = group.monthlyPlanned[idx] > 0 && Math.abs(group.monthlyRealized[idx] - group.monthlyPlanned[idx]) < 0.01;
                        return (
                          <TableCell key={idx} className={`text-right text-xs px-2 ${isComplete ? 'bg-green-100 text-green-700 font-medium' : ''}`}>
                            {total > 0 ? total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right font-bold text-xs">
                        {group.totalYear.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                    {expandedClasses[group.name] && group.assets.map(asset => (
                      <TableRow key={asset.id} className="hover:bg-slate-50/50">
                        <TableCell className="sticky left-0 bg-white z-10"></TableCell>
                        <TableCell className="pl-10 sticky left-[50px] bg-white z-10">
                          <div className="flex flex-col">
                            <span className="text-sm truncate max-w-[180px]" title={asset.name}>{asset.name}</span>
                            <span className="text-xs text-muted-foreground">{asset.assetNumber}</span>
                          </div>
                        </TableCell>
                        {asset.yearlyData.map((data: any, idx: number) => (
                          <TableCell key={idx} className={`text-right text-xs px-2 ${data.isCalculated ? 'text-green-600 font-medium' : 'text-slate-500'}`}>
                             {data.val > 0 ? data.val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (viewMode === 'projected' && data.val === 0 ? "-" : "-")}
                          </TableCell>
                        ))}
                        <TableCell className="text-right text-xs font-medium">
                          {asset.assetTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))}
                {classSummaryFiscal.length === 0 && (
                   <TableRow>
                     <TableCell colSpan={14} className="text-center py-4 text-muted-foreground">Nenhum dado para o período selecionado.</TableCell>
                   </TableRow>
                )}
              </TableBody>
              <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-200">
                <TableRow>
                  <TableCell className="sticky left-0 bg-slate-100 z-10"></TableCell>
                  <TableCell className="sticky left-[50px] bg-slate-100 z-10 text-right pr-4">TOTAL GERAL</TableCell>
                  {fiscalTotals.monthly.map((val, idx) => {
                    const isComplete = fiscalTotals.monthlyPlanned[idx] > 0 && Math.abs(fiscalTotals.monthlyRealized[idx] - fiscalTotals.monthlyPlanned[idx]) < 0.01;
                    return (
                      <TableCell key={idx} className={`text-right text-xs px-2 ${isComplete ? 'bg-green-100 text-green-700 font-medium' : ''}`}>
                        {val > 0 ? val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right text-xs">
                    {fiscalTotals.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              </tfoot>
            </Table>
          </div>
        </CardContent>
        )}
        {!isFiscalExpanded && (
        <CardContent>
          <div className="rounded-md border bg-white overflow-x-auto">
            <Table className="min-w-[1200px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px] sticky left-0 bg-white z-10"></TableHead>
                  <TableHead className="sticky left-[50px] bg-white z-10 min-w-[200px]">Classe do Ativo</TableHead>
                  {MONTH_LABELS.map((month, i) => (
                    <TableHead key={i} className="text-right text-xs px-2">
                      {month}
                    </TableHead>
                  ))}
                  <TableHead className="text-right font-bold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-slate-100 font-bold border-t-2 border-slate-200">
                  <TableCell className="sticky left-0 bg-slate-100 z-10"></TableCell>
                  <TableCell className="sticky left-[50px] bg-slate-100 z-10 text-right pr-4">TOTAL GERAL</TableCell>
                  {fiscalTotals.monthly.map((val, idx) => {
                    const isComplete = fiscalTotals.monthlyPlanned[idx] > 0 && Math.abs(fiscalTotals.monthlyRealized[idx] - fiscalTotals.monthlyPlanned[idx]) < 0.01;
                    return (
                      <TableCell key={idx} className={`text-right text-xs px-2 ${isComplete ? 'bg-green-100 text-green-700 font-medium' : ''}`}>
                        {val > 0 ? val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right text-xs">
                    {fiscalTotals.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
        )}
      </Card>

      <Card className="mb-6 border-green-100 bg-green-50/30">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setIsCorporateExpanded(!isCorporateExpanded)}>
            {isCorporateExpanded ? <ChevronDown className="h-5 w-5 text-slate-600" /> : <ChevronRight className="h-5 w-5 text-slate-600" />}
            <CardTitle className="text-lg font-bold text-slate-700">Resumo Anual por Classe - Societário ({selectedYear})</CardTitle>
          </div>
        </CardHeader>
        {isCorporateExpanded && (
        <CardContent>
          <div className="rounded-md border bg-white overflow-x-auto">
            <Table className="min-w-[1200px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px] sticky left-0 bg-white z-10"></TableHead>
                  <TableHead className="sticky left-[50px] bg-white z-10 min-w-[200px]">Classe do Ativo</TableHead>
                  {MONTH_LABELS.map((month, i) => (
                    <TableHead key={i} className="text-right text-xs px-2">
                      {month}
                    </TableHead>
                  ))}
                  <TableHead className="text-right font-bold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classSummaryCorporate.map((group) => (
                  <React.Fragment key={group.name}>
                    <TableRow className="bg-slate-50 font-medium cursor-pointer hover:bg-slate-100" onClick={() => toggleClass(group.name)}>
                      <TableCell className="sticky left-0 bg-slate-50 z-10">
                        {expandedClasses[group.name] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </TableCell>
                      <TableCell className="sticky left-[50px] bg-slate-50 z-10">
                        {group.name} <span className="text-xs text-muted-foreground font-normal ml-2">({group.assets.length})</span>
                      </TableCell>
                      {group.monthlyTotals.map((total, idx) => {
                        const isComplete = group.monthlyPlanned[idx] > 0 && Math.abs(group.monthlyRealized[idx] - group.monthlyPlanned[idx]) < 0.01;
                        return (
                          <TableCell key={idx} className={`text-right text-xs px-2 ${isComplete ? 'bg-green-100 text-green-700 font-medium' : ''}`}>
                            {total > 0 ? total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right font-bold text-xs">
                        {group.totalYear.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                    {expandedClasses[group.name] && group.assets.map(asset => (
                      <TableRow key={asset.id} className="hover:bg-slate-50/50">
                        <TableCell className="sticky left-0 bg-white z-10"></TableCell>
                        <TableCell className="pl-10 sticky left-[50px] bg-white z-10">
                          <div className="flex flex-col">
                            <span className="text-sm truncate max-w-[180px]" title={asset.name}>{asset.name}</span>
                            <span className="text-xs text-muted-foreground">{asset.assetNumber}</span>
                          </div>
                        </TableCell>
                        {asset.yearlyData.map((data: any, idx: number) => (
                          <TableCell key={idx} className={`text-right text-xs px-2 ${data.isCalculated ? 'text-green-600 font-medium' : 'text-slate-500'}`}>
                             {data.val > 0 ? data.val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}
                          </TableCell>
                        ))}
                        <TableCell className="text-right text-xs font-medium">
                          {asset.assetTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))}
                {classSummaryCorporate.length === 0 && (
                   <TableRow>
                     <TableCell colSpan={14} className="text-center py-4 text-muted-foreground">Nenhum dado para o período selecionado.</TableCell>
                   </TableRow>
                )}
              </TableBody>
              <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-200">
                <TableRow>
                  <TableCell className="sticky left-0 bg-slate-100 z-10"></TableCell>
                  <TableCell className="sticky left-[50px] bg-slate-100 z-10 text-right pr-4">TOTAL GERAL</TableCell>
                  {corporateTotals.monthly.map((val, idx) => {
                    const isComplete = corporateTotals.monthlyPlanned[idx] > 0 && Math.abs(corporateTotals.monthlyRealized[idx] - corporateTotals.monthlyPlanned[idx]) < 0.01;
                    return (
                      <TableCell key={idx} className={`text-right text-xs px-2 ${isComplete ? 'bg-green-100 text-green-700 font-medium' : ''}`}>
                        {val > 0 ? val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right text-xs">
                    {corporateTotals.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              </tfoot>
            </Table>
          </div>
        </CardContent>
        )}
        {!isCorporateExpanded && (
        <CardContent>
          <div className="rounded-md border bg-white overflow-x-auto">
            <Table className="min-w-[1200px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px] sticky left-0 bg-white z-10"></TableHead>
                  <TableHead className="sticky left-[50px] bg-white z-10 min-w-[200px]">Classe do Ativo</TableHead>
                  {MONTH_LABELS.map((month, i) => (
                    <TableHead key={i} className="text-right text-xs px-2">
                      {month}
                    </TableHead>
                  ))}
                  <TableHead className="text-right font-bold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-slate-100 font-bold border-t-2 border-slate-200">
                  <TableCell className="sticky left-0 bg-slate-100 z-10"></TableCell>
                  <TableCell className="sticky left-[50px] bg-slate-100 z-10 text-right pr-4">TOTAL GERAL</TableCell>
                  {corporateTotals.monthly.map((val, idx) => {
                    const isComplete = corporateTotals.monthlyPlanned[idx] > 0 && Math.abs(corporateTotals.monthlyRealized[idx] - corporateTotals.monthlyPlanned[idx]) < 0.01;
                    return (
                      <TableCell key={idx} className={`text-right text-xs px-2 ${isComplete ? 'bg-green-100 text-green-700 font-medium' : ''}`}>
                        {val > 0 ? val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right text-xs">
                    {corporateTotals.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
        )}
      </Card>

      <Card className="p-6 bg-slate-50/50">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium block mb-2">Selecione um Ativo</label>
            <Select value={selectedAssetId || ""} onValueChange={setSelectedAssetId} disabled={isLoading || !assets}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um ativo para ver o cálculo..." />
              </SelectTrigger>
              <SelectContent>
                {isLoading && <div className="flex items-center justify-center p-4"><Loader2 className="animate-spin" /></div>}
                {assets && assets.length > 0 ? (
                  assets.map((asset) => (
                    <SelectItem key={asset.id} value={asset.id.toString()}>
                      {asset.name} ({ (asset as any).assetNumber})
                    </SelectItem>
                  ))
                ) : (
                  <div className="text-center text-sm text-muted-foreground p-4">Nenhum ativo concluído encontrado.</div>
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-2">Filtrar Mês (Tabela)</label>
            <Input 
              type="month" 
              value={filterMonth} 
              onChange={(e) => setFilterMonth(e.target.value)} 
            />
          </div>
        </div>
      </Card>

      {selectedAssetId && (
        isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="animate-spin" />
          </div>
        ) : depreciationData ? (
          <Card className="p-6">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Mapa de Cálculo - {depreciationData.assetName}</h2>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleDepreciationStatus}
                >
                    {depreciationData.depreciationStatus === 'paused' ? (
                        <><Play className="mr-2 h-4 w-4" /> Reativar Cálculo</>
                    ) : (
                        <><Pause className="mr-2 h-4 w-4" /> Pausar Cálculo</>
                    )}
                </Button>
            </div>
            <div className="flex justify-end mb-4">
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={handleResetAsset}
                >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Resetar Depreciação
                </Button>
            </div>
            <div className="grid grid-cols-4 gap-4 mb-6 text-sm border rounded-lg p-4 bg-slate-50">
              <div><span className="font-medium text-muted-foreground">Valor do Ativo:</span> R$ {depreciationData.assetValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
              <div><span className="font-medium text-muted-foreground">Valor Residual:</span> R$ {depreciationData.residualValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
              <div><span className="font-medium text-muted-foreground">Vida Útil:</span> {depreciationData.usefulLife} meses</div>
              <div className="font-bold"><span className="font-medium text-muted-foreground">Valor Mensal:</span> R$ {depreciationData.monthlyDepreciation.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
              <div className={`font-bold ${depreciationData.depreciationStatus === 'paused' ? 'text-red-600' : 'text-green-600'}`}>
                <span className="font-medium text-muted-foreground">Status do Cálculo:</span> 
                {depreciationData.depreciationStatus === 'paused' ? ' Pausado' : ' Ativo'}
              </div>
              <div><span className="font-medium text-muted-foreground">Início Depreciação:</span> {depreciationData.depreciationStartDate.toLocaleDateString('pt-BR')}</div>
              <div><span className="font-medium text-muted-foreground">Fim Depreciação:</span> {depreciationData.depreciationEndDate.toLocaleDateString('pt-BR')}</div>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês/Ano (Projeção)</TableHead>
                    <TableHead className="text-right">Quota Mensal</TableHead>
                    <TableHead className="text-right">Depreciação Acumulada</TableHead>
                    <TableHead className="text-right">Valor Contábil</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Initial State */}
                  <TableRow className="bg-slate-50 font-medium">
                    <TableCell>Data de Ativação ({new Date(assets?.find(a=>a.id === selectedAssetId)?.availabilityDate || "").toLocaleDateString('pt-BR')})</TableCell>
                    <TableCell className="text-right text-green-600">(+ R$ {depreciationData.assetValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})</TableCell>
                    <TableCell className="text-right">R$ 0,00</TableCell>
                    <TableCell className="text-right">R$ {depreciationData.assetValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                  </TableRow>
                  {depreciationData.monthlyBreakdown
                    .filter(row => !filterMonth || row.dateStr === filterMonth)
                    .map((row, index) => (
                    <TableRow key={index}>
                      <TableCell className="capitalize">{row.month}</TableCell>
                      <TableCell className="text-right text-red-600">(- R$ {row.depreciation.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})</TableCell>
                      <TableCell className="text-right">R$ {row.accumulated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right font-medium">R$ {row.bookValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        ) : (
          <Card className="p-12 text-center">
            <p className="text-gray-500">Não foi possível calcular. Verifique se o ativo selecionado possui 'Data de Disponibilidade' e 'Vida Útil' preenchidas.</p>
          </Card>
        )
      )}
        </CardContent>
      </Card>
    </div>
  );
}
