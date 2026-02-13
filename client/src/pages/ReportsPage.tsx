import React, { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import { collection, updateDoc, doc, onSnapshot, query, orderBy } from "firebase/firestore";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar as CalendarIcon, CheckCircle2, FileText, User, Download, ChevronDown, ChevronRight, History, TrendingDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface InventoryResult {
  assetId: string;
  newCostCenter: string;
  verified: boolean;
}

interface InventorySchedule {
  id: string;
  requesterId?: string; // Opcional para suportar agendamentos antigos
  assetIds: string[];
  userIds: string[];
  date: string;
  notes: string;
  status: 'pending' | 'waiting_approval' | 'completed';
  results?: InventoryResult[];
  approvedBy?: string;
  approvedAt?: string;
  createdAt?: string;
}

const getBase64ImageFromURL = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.setAttribute("crossOrigin", "anonymous");
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const dataURL = canvas.toDataURL("image/png");
        resolve(dataURL);
      } else {
        reject(new Error("Canvas context is null"));
      }
    };
    img.onerror = (error) => reject(error);
    img.src = url;
  });
};

export default function ReportsPage() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<InventorySchedule[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [statusHistory, setStatusHistory] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [depreciationType, setDepreciationType] = useState<'fiscal' | 'corporate'>('fiscal');

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "inventory_schedules"), (snapshot) => {
      const loadedSchedules = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as InventorySchedule[];
      setSchedules(loadedSchedules);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(data);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "asset_status_history"), orderBy("changedAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setStatusHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "expenses"), (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const { data: assets } = trpc.assets.list.useQuery();
  const { data: assetClasses } = trpc.accounting.listAssetClasses.useQuery();
  const updateAssetMutation = trpc.assets.update.useMutation();

  const assetsByDate = useMemo(() => {
    if (!assets) return {};
    const groups: Record<string, any[]> = {};
    assets.forEach((asset: any) => {
      const date = asset.lastDepreciationDate || "Não Calculado";
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(asset);
    });
    
    return Object.keys(groups).sort((a, b) => {
        if (a === "Não Calculado") return 1;
        if (b === "Não Calculado") return -1;
        return b.localeCompare(a);
    }).reduce((acc, key) => {
        acc[key] = groups[key];
        return acc;
    }, {} as Record<string, any[]>);
  }, [assets]);

  // Garante a leitura do ID independente do formato do objeto user
  const currentUserId = (user as any)?.id || (user as any)?.openId || (user as any)?.uid || (user as any)?.sub;

  const handleApproveInventory = async (schedule: InventorySchedule) => {
    if (!schedule.results) return;

    try {
      // Atualiza os ativos com os novos centros de custo
      for (const result of schedule.results) {
        if (result.verified && result.newCostCenter) {
          await updateAssetMutation.mutateAsync({
            id: result.assetId,
            costCenter: result.newCostCenter
          } as any);
        }
      }

      const scheduleRef = doc(db, "inventory_schedules", schedule.id);
      await updateDoc(scheduleRef, { status: 'completed' });

      toast.success("Inventário aprovado e ativos atualizados com sucesso!");
    } catch (error) {
      toast.error("Erro ao atualizar ativos. Tente novamente.");
    }
  };

  // Filtra agendamentos que precisam de aprovação do usuário atual (solicitante)
  // Adicionado String() para garantir comparação correta e fallback (!s.requesterId) para itens legados
  const pendingApprovals = schedules.filter(s => 
    s.status === 'waiting_approval' && (!s.requesterId || String(s.requesterId) === String(currentUserId))
  );

  // Filtra agendamentos concluídos para histórico
  const completedSchedules = schedules.filter(s => 
    s.status === 'completed' && (!s.requesterId || String(s.requesterId) === String(currentUserId))
  );

  const schedulesByDate = useMemo(() => {
    const groups: Record<string, InventorySchedule[]> = {};
    completedSchedules.forEach(schedule => {
      const dateKey = schedule.date.includes('T') ? schedule.date.split('T')[0] : schedule.date;
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(schedule);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [completedSchedules]);

  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});

  const toggleDate = (date: string) => {
    setExpandedDates(prev => ({
      ...prev,
      [date]: !prev[date]
    }));
  };

  useEffect(() => {
    if (schedulesByDate.length > 0 && Object.keys(expandedDates).length === 0) {
      setExpandedDates({ [schedulesByDate[0][0]]: true });
    }
  }, [schedulesByDate]);

  const handleExportStatusHistory = () => {
    if (!statusHistory || statusHistory.length === 0) {
      toast.error("Não há dados de histórico para exportar.");
      return;
    }

    const dataToExport = statusHistory.map(log => ({
      "Data/Hora": new Date(log.changedAt).toLocaleString('pt-BR'),
      "Ativo": log.assetName,
      "Nº Ativo": log.assetNumber,
      "Status Anterior": log.oldStatus?.replace('_', ' ') || '-',
      "Novo Status": log.newStatus?.replace('_', ' ') || '-',
      "Alterado Por": log.changedBy,
      "Observações": log.notes || "-"
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Historico_Status_Ativos");

    // Auto-size columns
    const wscols = [
      { wch: 20 }, { wch: 30 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 25 }, { wch: 40 }
    ];
    ws['!cols'] = wscols;

    XLSX.writeFile(wb, `historico_status_ativos_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Histórico de status exportado para Excel com sucesso!");
  };

  const handleExportDepreciation = () => {
    if (!assets || assets.length === 0) {
      toast.error("Não há dados para exportar.");
      return;
    }

    const dataToExport = assets.map((asset: any) => {
        const assetExpenses = expenses.filter(e => String(e.assetId) === String(asset.id));
        const totalCost = assetExpenses.reduce((acc: number, curr: any) => acc + Number(curr.amount), Number(asset.value || 0));

        const normalize = (str: string) => str?.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || "";
        const assetClassDef = assetClasses?.find((c: any) => normalize(c.name) === normalize(asset.assetClass));
        const usefulLifeYears = depreciationType === 'corporate' 
            ? (Number(asset.corporateUsefulLife) || Number(assetClassDef?.corporateUsefulLife) || 0)
            : (Number(asset.usefulLife) || Number(assetClassDef?.usefulLife) || 0);

        const residualValue = Number(asset.residualValue || 0);
        const totalQuotas = usefulLifeYears * 12;
        let monthlyQuota = 0;
        let calculatedQuotas = 0;
        let accumulated = 0;

        if (usefulLifeYears > 0) {
            monthlyQuota = Math.max(0, totalCost - residualValue) / (usefulLifeYears * 12);
            if (asset.startDate && asset.lastDepreciationDate) {
                const start = new Date(asset.startDate);
                const end = new Date(asset.lastDepreciationDate);
                const monthsDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
                calculatedQuotas = Math.max(0, Math.min(monthsDiff, totalQuotas));
                accumulated = calculatedQuotas * monthlyQuota;
            }
        }

        const netValue = totalCost - accumulated;

        return {
            "Ativo": asset.name,
            "Plaqueta": asset.tagNumber || "-",
            "Classe": asset.assetClass || "-",
            "Status": asset.status ? asset.status.replace('_', ' ') : "-",
            "Data Início": asset.startDate ? new Date(asset.startDate).toLocaleDateString('pt-BR') : "-",
            "Qtd. Cotas": `${calculatedQuotas} / ${totalQuotas}`,
            "Data Último Cálculo": asset.lastDepreciationDate ? new Date(asset.lastDepreciationDate).toLocaleDateString('pt-BR') : "Não Calculado",
            "Custo Total": totalCost,
            "Cota Mensal": monthlyQuota,
            "Deprec. Acumulada": accumulated,
            "Valor Líquido": netValue
        };
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatorio_Depreciacao");

    XLSX.writeFile(wb, `relatorio_depreciacao_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Relatório de depreciação exportado com sucesso!");
  };

  const handleExportReport = async (schedule: InventorySchedule) => {
    if (!assets) return;

    try {
      const doc = new jsPDF();
      let logoData: string | null = null;
      try {
        logoData = await getBase64ImageFromURL("/oba.svg");
      } catch (error) {
        console.warn("Logo não carregado:", error);
      }

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const addHeaderAndWatermark = (data: any) => {
        // Watermark
        if (logoData) {
          doc.saveGraphicsState();
          doc.setGState(new (doc as any).GState({ opacity: 0.1 }));
          const wmWidth = 80;
          const wmHeight = 40;
          const wmX = (pageWidth - wmWidth) / 2;
          const wmY = (pageHeight - wmHeight) / 2;
          doc.addImage(logoData, 'PNG', wmX, wmY, wmWidth, wmHeight);
          doc.restoreGraphicsState();

          // Header
          doc.addImage(logoData, 'PNG', 14, 10, 25, 15);
        }
        doc.setFontSize(16);
        doc.setTextColor(40);
        doc.text("Relatório de Inventário", pageWidth - 14, 18, { align: 'right' });
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`Data: ${new Date(schedule.date).toLocaleDateString('pt-BR')}`, pageWidth - 14, 24, { align: 'right' });
        
        doc.setDrawColor(200);
        doc.line(14, 30, pageWidth - 14, 30);
      };

      const tableData = schedule.assetIds.map(id => {
        const asset = assets.find(a => a.id === id);
        const result = schedule.results?.find(r => r.assetId === id);
        
        const currentCC = typeof asset?.costCenter === 'object' ? (asset.costCenter as any).code : asset?.costCenter;
        const newCC = result?.newCostCenter || currentCC;

        return [
          asset?.assetNumber || "-",
          asset?.name || "-",
          currentCC || "-",
          newCC || "-",
          result?.verified ? "Verificado" : "Não Verificado"
        ];
      });

      autoTable(doc, {
        head: [["Nº Ativo", "Nome", "CC Anterior", "Novo CC", "Status"]],
        body: tableData,
        startY: 35,
        didDrawPage: addHeaderAndWatermark,
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [240, 253, 244] },
        margin: { top: 35 }
      });

      // Signatures
      const finalY = (doc as any).lastAutoTable.finalY + 40;
      
      doc.setDrawColor(0);
      doc.line(20, finalY, 80, finalY);
      doc.line(130, finalY, 190, finalY);

      // Assinatura do Solicitante
      const requester = users.find(u => String(u.id) === String(schedule.requesterId));
      if (requester?.signature && requester.signature.startsWith('data:image')) {
        try {
          doc.addImage(requester.signature, 'PNG', 30, finalY - 25, 40, 20);
        } catch (e) { console.warn("Erro ao adicionar assinatura do solicitante", e); }
      }

      // Assinatura do Responsável (pega o primeiro se houver múltiplos)
      const responsibleId = schedule.userIds[0];
      const responsible = users.find(u => String(u.id) === String(responsibleId));
      if (responsible?.signature && responsible.signature.startsWith('data:image')) {
        try {
          doc.addImage(responsible.signature, 'PNG', 140, finalY - 25, 40, 20);
        } catch (e) { console.warn("Erro ao adicionar assinatura do responsável", e); }
      }
      
      doc.setFontSize(10);
      doc.setTextColor(0);
      doc.text("Assinatura do Solicitante", 50, finalY + 5, { align: 'center' });
      doc.text("Assinatura do Responsável", 160, finalY + 5, { align: 'center' });
      doc.text(requester?.name || "", 50, finalY + 10, { align: 'center' });
      doc.text(responsible?.name || "", 160, finalY + 10, { align: 'center' });

      doc.setFontSize(8);
      doc.setTextColor(100);
      
      const requestedDate = schedule.createdAt 
        ? new Date(schedule.createdAt).toLocaleString('pt-BR') 
        : new Date(schedule.date).toLocaleDateString('pt-BR');

      const signatureDate = schedule.approvedAt 
        ? new Date(schedule.approvedAt).toLocaleString('pt-BR') 
        : new Date().toLocaleString('pt-BR');
      
      doc.text(`Solicitado em: ${requestedDate}`, 50, finalY + 15, { align: 'center' });
      doc.text(`Data: ${signatureDate}`, 160, finalY + 15, { align: 'center' });

      doc.save(`relatorio_inventario_${new Date(schedule.date).toISOString().split('T')[0]}.pdf`);
      toast.success("Relatório PDF gerado com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast.error("Erro ao gerar PDF.");
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-slate-700 flex items-center gap-2">
        <FileText className="h-8 w-8" />
        Relatórios
      </h1>

      <Tabs defaultValue="status-history" className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-auto p-1 gap-1">
          <TabsTrigger 
            value="status-history" 
            className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-600 text-[144%] py-1 font-bold transition-all border border-blue-600 shadow-md rounded-md"
          >
            Rastreabilidade
          </TabsTrigger>
          <TabsTrigger 
            value="depreciation" 
            className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-slate-600 text-[144%] py-1 font-bold transition-all border border-emerald-600 shadow-md rounded-md"
          >
            Depreciação
          </TabsTrigger>
          <TabsTrigger 
            value="inventory-history" 
            className="data-[state=active]:bg-orange-600 data-[state=active]:text-white text-slate-600 text-[144%] py-1 font-bold transition-all border border-orange-600 shadow-md rounded-md"
          >
            Histórico Inventários
          </TabsTrigger>
        </TabsList>

      {/* Seção de Rastreabilidade de Status */}
      <TabsContent value="status-history">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-slate-700 text-xl">
              <History className="h-6 w-6" />
              Rastreabilidade de Status dos Ativos
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleExportStatusHistory} className="bg-green-600 hover:bg-green-700 text-white">
                <Download className="h-4 w-4 mr-2" />
                Exportar Excel
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead>Status Anterior</TableHead>
                  <TableHead>Novo Status</TableHead>
                  <TableHead>Alterado Por</TableHead>
                  <TableHead>Observações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statusHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Nenhum histórico registrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  statusHistory.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{new Date(log.changedAt).toLocaleString('pt-BR')}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{log.assetName}</span>
                          <span className="text-xs text-muted-foreground">{log.assetNumber}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 capitalize">
                          {log.oldStatus?.replace('_', ' ') || '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                          {log.newStatus?.replace('_', ' ') || '-'}
                        </span>
                      </TableCell>
                      <TableCell>{log.changedBy}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{log.notes || "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      </TabsContent>

      {/* Seção de Depreciação/Amortização */}
      <TabsContent value="depreciation">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-slate-700 text-xl">
              <TrendingDown className="h-6 w-6" />
              Relatório de Depreciação/Amortização
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setDepreciationType(prev => prev === 'fiscal' ? 'corporate' : 'fiscal')}
                  className="text-xs text-slate-400 hover:text-slate-600"
              >
                  {depreciationType === 'fiscal' ? 'Visão Fiscal' : 'Visão Societária'}
              </Button>
              <Button size="sm" onClick={handleExportDepreciation} className="bg-green-600 hover:bg-green-700 text-white">
                <Download className="h-4 w-4 mr-2" />
                Exportar Excel
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {Object.entries(assetsByDate).map(([date, groupAssets]) => {
            const runTime = groupAssets.find((a: any) => a.lastDepreciationRunAt)?.lastDepreciationRunAt;
            
            return (
            <div key={date} className="mb-8 last:mb-0">
                <h3 className="text-sm font-semibold text-slate-500 mb-3 flex items-center gap-2 uppercase tracking-wider bg-slate-50 p-2 rounded border">
                    <CalendarIcon className="h-4 w-4" />
                    {date === "Não Calculado" ? "Não Calculado" : (
                        <div className="flex items-center gap-2">
                            <span>Data do Cálculo: {new Date(date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                            {runTime && <span className="text-xs text-muted-foreground font-normal normal-case border-l pl-2">Processado em: {new Date(runTime).toLocaleString('pt-BR')}</span>}
                        </div>
                    )}
                    <span className="ml-auto text-xs font-normal normal-case bg-white px-2 py-0.5 rounded border">
                        {groupAssets.length} ativos
                    </span>
                </h3>
                <div className="rounded-md border overflow-hidden">
                    <Table>
                    <TableHeader>
                        <TableRow>
                        <TableHead>Ativo</TableHead>
                        <TableHead>Plaqueta</TableHead>
                        <TableHead>Classe</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Data Início</TableHead>
                        <TableHead className="text-center">Qtd. Cotas</TableHead>
                        <TableHead className="text-right">Custo Total</TableHead>
                        <TableHead className="text-right">Cota Mensal</TableHead>
                        <TableHead className="text-right">Deprec. Acumulada</TableHead>
                        <TableHead className="text-right">Valor Líquido</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {groupAssets.map((asset: any) => {
                            const assetExpenses = expenses.filter(e => String(e.assetId) === String(asset.id));
                            const totalCost = assetExpenses.reduce((acc: number, curr: any) => acc + Number(curr.amount), Number(asset.value || 0));

                            const normalize = (str: string) => str?.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || "";
                            const assetClassDef = assetClasses?.find((c: any) => normalize(c.name) === normalize(asset.assetClass));
                            const usefulLifeYears = depreciationType === 'corporate' 
                                ? (Number(asset.corporateUsefulLife) || Number(assetClassDef?.corporateUsefulLife) || 0)
                                : (Number(asset.usefulLife) || Number(assetClassDef?.usefulLife) || 0);

                            const residualValue = Number(asset.residualValue || 0);
                            const totalQuotas = usefulLifeYears * 12;
                            let monthlyQuota = 0;
                            let calculatedQuotas = 0;
                            let accumulated = 0;

                            if (usefulLifeYears > 0) {
                                monthlyQuota = Math.max(0, totalCost - residualValue) / (usefulLifeYears * 12);
                                if (asset.startDate && asset.lastDepreciationDate) {
                                    const start = new Date(asset.startDate);
                                    const end = new Date(asset.lastDepreciationDate);
                                    const monthsDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
                                    calculatedQuotas = Math.max(0, Math.min(monthsDiff, totalQuotas));
                                    accumulated = calculatedQuotas * monthlyQuota;
                                }
                            }

                            const netValue = totalCost - accumulated;

                            return (
                                <TableRow key={asset.id}>
                                    <TableCell className="font-medium">{asset.name}</TableCell>
                                    <TableCell>{asset.tagNumber || "-"}</TableCell>
                                    <TableCell>{asset.assetClass || "-"}</TableCell>
                                    <TableCell className="capitalize">{asset.status?.replace('_', ' ') || "-"}</TableCell>
                                    <TableCell>{asset.startDate ? new Date(asset.startDate).toLocaleDateString('pt-BR') : "-"}</TableCell>
                                    <TableCell className="text-center">{calculatedQuotas} / {totalQuotas}</TableCell>
                                    <TableCell className="text-right">R$ {totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell className="text-right">R$ {monthlyQuota.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell className="text-right text-red-600">R$ {accumulated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell className="text-right font-bold">R$ {netValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                    </Table>
                </div>
            </div>
            );
          })}
          {(!assets || assets.length === 0) && (
            <div className="text-center py-8 text-muted-foreground">
                Nenhum ativo encontrado.
            </div>
          )}
        </CardContent>
      </Card>
      </TabsContent>

      {/* Seção de Histórico de Inventários Concluídos */}
      <TabsContent value="inventory-history">
      <div className="space-y-6">
      {/* Seção de Aprovações Pendentes */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-blue-800 text-2xl">
            <CheckCircle2 className="h-5 w-5" />
            Aprovações de Inventário Pendentes ({pendingApprovals.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingApprovals.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pendingApprovals.map(schedule => (
                <div key={schedule.id} className="bg-white p-4 rounded-lg border border-blue-100 shadow-sm flex flex-col justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <CalendarIcon className="h-5 w-5 text-blue-600" />
                      <span className="font-medium text-slate-800 text-lg">
                        Realizado em: {new Date(schedule.date).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-lg text-slate-600 mb-2">
                      <p><strong>{schedule.assetIds.length}</strong> ativos verificados.</p>
                      <div className="flex items-center gap-1 mt-1 text-base text-slate-500">
                        <User className="h-4 w-4" />
                        Responsáveis: {schedule.userIds.map(uid => users?.find(u => u.id === uid)?.name).filter(Boolean).join(", ") || "N/A"}
                      </div>
                    </div>
                  </div>
                  <Button onClick={() => handleApproveInventory(schedule)} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-lg h-12">
                    Aceitar Contagem e Atualizar
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-lg text-blue-600/80">Nenhuma aprovação pendente no momento.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-slate-700 text-xl">
              <FileText className="h-6 w-6" />
              Histórico de Inventários Concluídos
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {schedulesByDate.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-lg">
              Nenhum inventário concluído.
            </div>
          ) : (
            <div className="space-y-4">
              {schedulesByDate.map(([date, daySchedules]) => (
                <div key={date} className="border rounded-md overflow-hidden">
                  <div 
                    className="bg-slate-100 p-3 flex items-center justify-between cursor-pointer hover:bg-slate-200 transition-colors"
                    onClick={() => toggleDate(date)}
                  >
                    <div className="flex items-center gap-2 font-medium text-slate-700 text-lg">
                      {expandedDates[date] ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                      <CalendarIcon className="h-5 w-5 text-slate-500" />
                      <span className="capitalize">
                        {new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                      </span>
                      <span className="text-sm font-normal text-muted-foreground ml-2 bg-white px-2 py-0.5 rounded-full border">
                        {daySchedules.length} {daySchedules.length === 1 ? 'inventário' : 'inventários'}
                      </span>
                    </div>
                  </div>
                  
                  {expandedDates[date] && (
                    <div className="border-t">
                      <Table className="text-lg">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-lg">Ativo</TableHead>
                            <TableHead className="text-lg">Nome</TableHead>
                            <TableHead className="text-lg">CC Anterior</TableHead>
                            <TableHead className="text-lg">Novo CC</TableHead>
                            <TableHead className="text-right text-lg">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {daySchedules.map(schedule => (
                            <React.Fragment key={schedule.id}>
                              <TableRow className="bg-slate-50/50 hover:bg-slate-100">
                                <TableCell colSpan={5} className="py-3">
                                  <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-4 text-base">
                                      <div className="flex items-center gap-2 text-slate-600">
                                        <User className="w-5 h-5" />
                                        <span className="font-medium">Responsáveis:</span>
                                        {schedule.userIds.map(uid => users?.find(u => u.id === uid)?.name).filter(Boolean).join(", ")}
                                      </div>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => handleExportReport(schedule)} className="h-10 text-base bg-white border-slate-300 hover:bg-slate-50">
                                      <Download className="w-5 h-5 mr-2" /> Exportar PDF
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                              {schedule.assetIds.map(id => {
                                const asset = assets?.find(a => a.id === id);
                                const result = schedule.results?.find(r => r.assetId === id);
                                const currentCC = typeof asset?.costCenter === 'object' ? (asset.costCenter as any).code : asset?.costCenter;
                                return (
                                  <TableRow key={id} className="hover:bg-slate-50/50">
                                    <TableCell className="font-mono text-base pl-6">{asset?.assetNumber}</TableCell>
                                    <TableCell className="text-lg">{asset?.name}</TableCell>
                                    <TableCell className="text-muted-foreground text-lg">{currentCC || "-"}</TableCell>
                                    <TableCell className={`text-lg ${result?.newCostCenter !== currentCC ? "text-orange-600 font-bold" : ""}`}>
                                      {result?.newCostCenter || currentCC || "-"}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {result?.verified ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-sm font-medium bg-green-100 text-green-800">
                                                Verificado
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground text-sm">Pendente</span>
                                        )}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </React.Fragment>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
      </TabsContent>
      </Tabs>
    </div>
  );
}