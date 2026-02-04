import React, { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import { collection, updateDoc, doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, CheckCircle2, FileText, User, Download, ChevronDown, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

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

  const { data: assets } = trpc.assets.list.useQuery();
  const updateAssetMutation = trpc.assets.update.useMutation();

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
        Relatórios e Aprovações
      </h1>

      {/* Seção de Aprovações Pendentes */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-blue-800 text-lg">
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
                      <CalendarIcon className="h-4 w-4 text-blue-600" />
                      <span className="font-medium text-slate-800">
                        Realizado em: {new Date(schedule.date).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-sm text-slate-600 mb-2">
                      <p><strong>{schedule.assetIds.length}</strong> ativos verificados.</p>
                      <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
                        <User className="h-3 w-3" />
                        Responsáveis: {schedule.userIds.map(uid => users?.find(u => u.id === uid)?.name).filter(Boolean).join(", ") || "N/A"}
                      </div>
                    </div>
                  </div>
                  <Button onClick={() => handleApproveInventory(schedule)} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                    Aceitar Contagem e Atualizar
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-blue-600/80">Nenhuma aprovação pendente no momento.</p>
          )}
        </CardContent>
      </Card>

      {/* Seção de Histórico de Inventários Concluídos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-slate-700 text-lg">
            <FileText className="h-5 w-5" />
            Histórico de Inventários Concluídos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {schedulesByDate.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
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
                    <div className="flex items-center gap-2 font-medium text-slate-700">
                      {expandedDates[date] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <CalendarIcon className="h-4 w-4 text-slate-500" />
                      <span className="capitalize">
                        {new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                      </span>
                      <span className="text-xs font-normal text-muted-foreground ml-2 bg-white px-2 py-0.5 rounded-full border">
                        {daySchedules.length} {daySchedules.length === 1 ? 'inventário' : 'inventários'}
                      </span>
                    </div>
                  </div>
                  
                  {expandedDates[date] && (
                    <div className="border-t">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Ativo</TableHead>
                            <TableHead>Nome</TableHead>
                            <TableHead>CC Anterior</TableHead>
                            <TableHead>Novo CC</TableHead>
                            <TableHead className="text-right">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {daySchedules.map(schedule => (
                            <React.Fragment key={schedule.id}>
                              <TableRow className="bg-slate-50/50 hover:bg-slate-100">
                                <TableCell colSpan={5} className="py-3">
                                  <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-4 text-sm">
                                      <div className="flex items-center gap-2 text-slate-600">
                                        <User className="w-4 h-4" />
                                        <span className="font-medium">Responsáveis:</span>
                                        {schedule.userIds.map(uid => users?.find(u => u.id === uid)?.name).filter(Boolean).join(", ")}
                                      </div>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => handleExportReport(schedule)} className="h-8 bg-white border-slate-300 hover:bg-slate-50">
                                      <Download className="w-3 h-3 mr-2" /> Exportar PDF
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
                                    <TableCell className="font-mono text-xs pl-6">{asset?.assetNumber}</TableCell>
                                    <TableCell>{asset?.name}</TableCell>
                                    <TableCell className="text-muted-foreground">{currentCC || "-"}</TableCell>
                                    <TableCell className={result?.newCostCenter !== currentCC ? "text-orange-600 font-bold" : ""}>
                                      {result?.newCostCenter || currentCC || "-"}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {result?.verified ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                                Verificado
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground text-xs">Pendente</span>
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
  );
}