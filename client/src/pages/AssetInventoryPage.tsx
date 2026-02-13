import React, { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, updateDoc, doc, onSnapshot, writeBatch } from "firebase/firestore";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, Download, QrCode, ClipboardList, Calendar as CalendarIcon, Users, CheckCircle2, AlertCircle, PlayCircle, Check, XCircle, ChevronDown, ChevronUp, Camera, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useLocation } from "wouter";

interface InventoryResult {
  assetId: string;
  newCostCenter: string;
  verified: boolean;
  observations?: string;
}

interface InventorySchedule {
  id: string;
  requesterId?: string;
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

export default function AssetInventoryPage() {
  const { user: authUser } = useAuth();
  const [user, setUser] = useState<any>(authUser);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (authUser) {
      setUser(authUser);
    } else {
      const storedUser = localStorage.getItem("obras_user");
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (e) {
          console.error("Erro ao recuperar usuário do storage", e);
        }
      }
    }
  }, [authUser]);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [performingSchedule, setPerformingSchedule] = useState<InventorySchedule | null>(null);
  const [reviewingSchedule, setReviewingSchedule] = useState<InventorySchedule | null>(null);
  const [executionData, setExecutionData] = useState<Record<string, { verified: boolean; costCenter: string; observations: string }>>({});
  const [selectedForApproval, setSelectedForApproval] = useState<string[]>([]);

  useEffect(() => {
    if (reviewingSchedule?.results) {
      setSelectedForApproval(reviewingSchedule.results.map(r => r.assetId));
    } else {
      setSelectedForApproval([]);
    }
  }, [reviewingSchedule]);

  const toggleApproval = (assetId: string) => {
    setSelectedForApproval(prev => 
      prev.includes(assetId) ? prev.filter(id => id !== assetId) : [...prev, assetId]
    );
  };

  const [schedules, setSchedules] = useState<InventorySchedule[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
    const unsubscribe = onSnapshot(collection(db, "projects"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(data);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "assets"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAssets(data);
      setIsLoading(false);
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
    const unsubscribe = onSnapshot(collection(db, "cost_centers"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCostCenters(data);
    });
    return () => unsubscribe();
  }, []);
  
  // Schedule Form State
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [selectedCostCenter, setSelectedCostCenter] = useState("all");
  const [scanInput, setScanInput] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const filteredAssets = assets?.filter(asset => {
    const matchesSearch = (asset.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (asset.tagNumber || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (asset.assetNumber || "").toLowerCase().includes(searchTerm.toLowerCase());
    const assetCC = typeof asset.costCenter === 'object' ? (asset.costCenter as any).code : asset.costCenter;
    const matchesCostCenter = selectedCostCenter === "all" || assetCC === selectedCostCenter;
    return matchesSearch && matchesCostCenter;
  });

  // Efeito para abrir o modal diretamente via URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const scheduleId = params.get('schedule');

    if (scheduleId && schedules.length > 0) {
      const scheduleToOpen = schedules.find(s => s.id === scheduleId);
      if (scheduleToOpen && scheduleToOpen.status === 'pending') {
        setPerformingSchedule(scheduleToOpen);
        // Limpa o parâmetro da URL sem recarregar o componente (evita reset do state)
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  });
  // Garante a leitura do ID independente do formato do objeto user (id, uid, openId, sub)
  const currentUserId = (user as any)?.id || (user as any)?.openId || (user as any)?.uid || (user as any)?.sub;
  const userRole = (user as any)?.role;

  const myPendingSchedules = schedules.filter(s => 
    s.status === 'pending' && currentUserId && s.userIds.some(uid => String(uid) === String(currentUserId))
  );

  const pendingApprovalSchedules = schedules.filter(s => 
    s.status === 'waiting_approval' && (
      userRole === 'admin' || 
      (s.requesterId && String(s.requesterId) === String(currentUserId))
    )
  );

  const completedSchedules = schedules
    .filter(s => s.status === 'completed')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const handleApproveInventory = async (schedule: InventorySchedule) => {
    try {
      const batch = writeBatch(db);
      
      // Atualiza os ativos com as novas informações (se houver mudança de centro de custo)
      if (schedule.results) {
        schedule.results.forEach(result => {
          if (result.newCostCenter && selectedForApproval.includes(result.assetId)) {
            const assetRef = doc(db, "assets", result.assetId);
            batch.update(assetRef, { 
              costCenter: result.newCostCenter,
              updatedAt: new Date().toISOString()
            });
          }
        });
      }

      // Atualiza o status do agendamento para concluído
      const scheduleRef = doc(db, "inventory_schedules", schedule.id);
      batch.update(scheduleRef, { 
        status: 'completed',
        approvedBy: user?.name || "Administrador",
        approvedAt: new Date().toISOString()
      });

      await batch.commit();
      toast.success("Inventário aprovado e processado com sucesso!");
    } catch (error) {
      console.error("Erro ao aprovar inventário:", error);
      toast.error("Erro ao processar aprovação.");
    }
  };

  const handleRejectInventory = async (schedule: InventorySchedule) => {
    try {
      const scheduleRef = doc(db, "inventory_schedules", schedule.id);
      await updateDoc(scheduleRef, { status: 'pending' });
      toast.success("Inventário rejeitado e retornado para pendente.");
      setReviewingSchedule(null);
    } catch (error) {
      toast.error("Erro ao rejeitar inventário.");
    }
  };

  // Inicializa os dados de execução quando o diálogo abre
  useEffect(() => {
    if (performingSchedule && assets) {
      const initialData: Record<string, { verified: boolean; costCenter: string; observations: string }> = {};
      performingSchedule.assetIds.forEach(id => {
        const asset = assets.find(a => a.id === id);
        const currentCC = typeof asset?.costCenter === 'object' ? (asset.costCenter as any).code : asset?.costCenter;
        initialData[id] = {
          verified: false, // Inicia como não verificado para forçar a contagem
          costCenter: currentCC || "",
          observations: ""
        };
      });
      setExecutionData(initialData);
      setScanInput("");
    }
  }, [performingSchedule, assets]);

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!performingSchedule || !scanInput) return;

    const term = scanInput.trim().toLowerCase();
    
    // Procura o ativo na lista do agendamento
    const assetId = performingSchedule.assetIds.find(id => {
      const asset = assets.find(a => a.id === id);
      return asset && (
        (asset.tagNumber && asset.tagNumber.toLowerCase() === term) ||
        (asset.assetNumber && asset.assetNumber.toLowerCase() === term)
      );
    });

    if (assetId) {
      if (executionData[assetId]?.verified) {
         toast.info(`Ativo já conferido: ${scanInput}`);
      } else {
         setExecutionData(prev => ({
            ...prev,
            [assetId]: { ...prev[assetId], verified: true }
         }));
         toast.success(`Ativo conferido: ${scanInput}`);
         // Feedback sonoro simples
         const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
         audio.play().catch(() => {});
      }
      setScanInput("");
    } else {
      toast.error(`Ativo não encontrado na lista deste inventário: ${scanInput}`);
    }
  };

  const startScanning = () => {
    setIsScanning(true);
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let interval: NodeJS.Timeout;

    if (isScanning) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then(s => {
          stream = s;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(console.error);
          }

          // Tenta usar API nativa de detecção se disponível
          if ('BarcodeDetector' in window) {
             try {
                 const detector = new (window as any).BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13', 'data_matrix'] });
                 interval = setInterval(async () => {
                    if (videoRef.current && videoRef.current.readyState === 4) {
                        try {
                            const barcodes = await detector.detect(videoRef.current);
                            if (barcodes.length > 0) {
                                setScanInput(barcodes[0].rawValue);
                                setIsScanning(false);
                                toast.success("Código lido!");
                            }
                        } catch (e) {}
                    }
                 }, 500);
             } catch (e) { console.warn("BarcodeDetector error", e); }
          }
        })
        .catch(err => {
          console.error("Erro câmera", err);
          toast.error("Erro ao acessar câmera. Verifique as permissões.");
          setIsScanning(false);
        });
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
      if (interval) clearInterval(interval);
    };
  }, [isScanning]);

  const handleCompleteInventory = async (scheduleId: string) => {
    // Transforma os dados de execução em resultados para salvar
    const results: InventoryResult[] = Object.entries(executionData).map(([assetId, data]) => ({
      assetId,
      newCostCenter: data.costCenter,
      verified: data.verified,
      observations: data.observations
    }));

    const scheduleRef = doc(db, "inventory_schedules", scheduleId);
    await updateDoc(scheduleRef, { status: 'waiting_approval', results });

    setPerformingSchedule(null);
    toast.success("Contagem enviada para aprovação do solicitante!");

    // Redirecionar para a primeira página permitida (exceto inventário)
    const navItems = [
        { id: 'dashboard', path: '/dashboard' },
        { id: 'projects', path: '/projects' },
        { id: 'budgets', path: '/budgets' },
        { id: 'assets', path: '/assets' },
        { id: 'asset-movements', path: '/asset-movements' },
        { id: 'asset-depreciation', path: '/asset-depreciation' },
        { id: 'reports', path: '/reports' },
        { id: 'accounting', path: '/accounting' },
        { id: 'users', path: '/users' },
    ];

    const role = (user as any)?.role;
    const allowedPages = (user as any)?.allowedPages || [];

    const firstAllowed = navItems.find(item => {
        if (role === 'admin') return true;
        return allowedPages.includes(item.id) || item.id === 'dashboard';
    });

    setLocation(firstAllowed ? firstAllowed.path : '/dashboard');
  };

  const getActiveSchedule = (assetId: string) => {
    return schedules.find(s => (s.status === 'pending' || s.status === 'waiting_approval') && s.assetIds.includes(assetId));
  };

  const toggleAssetSelection = (id: string) => {
    if (getActiveSchedule(id)) return;
    setSelectedAssetIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const availableAssets = filteredAssets?.filter(a => !getActiveSchedule(a.id)) || [];
  const isAllSelected = availableAssets.length > 0 && availableAssets.every(a => selectedAssetIds.includes(a.id));

  const toggleAllAssets = () => {
    if (!availableAssets.length) return;
    
    if (isAllSelected) {
      setSelectedAssetIds([]);
    } else {
      // Only select assets that are not already scheduled
      setSelectedAssetIds(availableAssets.map(a => a.id));
    }
  };

  const toggleUserSelection = (id: string) => {
    setSelectedUserIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleScheduleSubmit = async () => {
    if (selectedAssetIds.length === 0) {
      toast.error("Selecione pelo menos um ativo.");
      return;
    }
    if (selectedUserIds.length === 0) {
      toast.error("Selecione pelo menos um responsável.");
      return;
    }
    if (!scheduleDate) {
      toast.error("Selecione uma data.");
      return;
    }

    // O ID será gerado automaticamente pelo Firestore
    const newScheduleData = {
      requesterId: currentUserId,
      assetIds: selectedAssetIds,
      userIds: selectedUserIds,
      date: scheduleDate,
      notes,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    await addDoc(collection(db, "inventory_schedules"), newScheduleData);

    toast.success("Inventário agendado com sucesso!", {
      description: `${selectedAssetIds.length} ativos atribuídos a ${selectedUserIds.length} responsáveis para ${new Date(scheduleDate).toLocaleDateString()}.`
    });

    // Reset
    setIsScheduleOpen(false);
    setSelectedAssetIds([]);
    setSelectedUserIds([]);
    setNotes("");
  };

  const handleExport = async () => {
    if (!filteredAssets) return;
    
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
        doc.text("Relatório Geral de Ativos", pageWidth - 14, 18, { align: 'right' });
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, pageWidth - 14, 24, { align: 'right' });
        
        doc.setDrawColor(200);
        doc.line(14, 30, pageWidth - 14, 30);
      };

      const tableData = filteredAssets.map(asset => {
        const project = projects?.find(p => p.id === asset.projectId);
        return [
          asset.assetNumber || "-",
          asset.tagNumber || "-",
          asset.name || "-",
          asset.status?.replace('_', ' ') || "-",
          project?.name || "N/A",
          asset.value ? Number(asset.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : "-"
        ];
      });

      autoTable(doc, {
        head: [["Nº Ativo", "Plaqueta", "Nome", "Status", "Obra/Local", "Valor"]],
        body: tableData,
        startY: 35,
        didDrawPage: addHeaderAndWatermark,
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold' }, // Green-600 like
        alternateRowStyles: { fillColor: [240, 253, 244] },
        margin: { top: 35 }
      });

      doc.save("inventario_ativos.pdf");
      toast.success("Relatório PDF gerado com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast.error("Erro ao gerar PDF.");
    }
  };

  const handleExportScheduleResult = async (schedule: InventorySchedule) => {
    if (!schedule.results) return;
    
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
        doc.text("Relatório de Inventário Concluído", pageWidth - 14, 18, { align: 'right' });
        
        doc.setFontSize(10);
        doc.setTextColor(80);
        doc.text(`Data do Inventário: ${new Date(schedule.date).toLocaleDateString('pt-BR')}`, pageWidth - 14, 24, { align: 'right' });
        doc.text(`Aprovado Por: ${schedule.approvedBy || "-"}`, pageWidth - 14, 29, { align: 'right' });
        doc.text(`Data Aprovação: ${schedule.approvedAt ? new Date(schedule.approvedAt).toLocaleString('pt-BR') : "-"}`, pageWidth - 14, 34, { align: 'right' });

        doc.setDrawColor(200);
        doc.line(14, 38, pageWidth - 14, 38);
      };

      const tableData = schedule.results.map(result => {
        const asset = assets.find(a => a.id === result.assetId);
        return [
          asset?.name || "Ativo Removido",
          asset?.tagNumber || "-",
          result.verified ? "Sim" : "Não",
          result.newCostCenter || "Mantido"
        ];
      });

      autoTable(doc, {
        head: [["Ativo", "Plaqueta", "Verificado", "Novo Centro de Custo"]],
        body: tableData,
        startY: 45,
        didDrawPage: addHeaderAndWatermark,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' }, // Blue-600
        alternateRowStyles: { fillColor: [239, 246, 255] },
        margin: { top: 45 }
      });

      doc.save(`inventario_concluido_${schedule.date}.pdf`);
      toast.success("Relatório PDF gerado com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast.error("Erro ao gerar PDF.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-slate-700 flex items-center gap-2">
          <ClipboardList className="h-8 w-8" />
          Inventário de Ativos
        </h1>
        <div className="flex gap-2">
          <Button onClick={handleExport} variant="outline">
            <Download className="mr-2 h-4 w-4" /> Exportar Lista
          </Button>
          
          <Dialog open={isScheduleOpen} onOpenChange={setIsScheduleOpen}>
            <DialogTrigger asChild>
              <Button disabled={selectedAssetIds.length === 0} className="bg-blue-600 hover:bg-blue-700">
                <CalendarIcon className="mr-2 h-4 w-4" /> 
                Agendar Inventário ({selectedAssetIds.length})
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Novo Agendamento de Inventário</DialogTitle>
                <DialogDescription>
                  Defina a data e os responsáveis pela conferência dos {selectedAssetIds.length} ativos selecionados.
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-6 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data do Inventário</Label>
                    <Input 
                      type="date" 
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Observações</Label>
                    <Input 
                      placeholder="Ex: Conferência anual..." 
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Selecionar Responsáveis
                  </Label>
                  <div className="border rounded-md p-4 bg-slate-50 max-h-[200px] overflow-y-auto">
                    {users ? (
                      <div className="grid grid-cols-2 gap-2">
                        {users.map((user: any) => (
                          <div key={user.id} className="flex items-center space-x-2 bg-white p-2 rounded border">
                            <Checkbox 
                              id={`user-${user.id}`} 
                              checked={selectedUserIds.includes(user.id)}
                              onCheckedChange={() => toggleUserSelection(user.id)}
                            />
                            <label 
                              htmlFor={`user-${user.id}`} 
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                            >
                              {user.name}
                              <span className="block text-xs text-muted-foreground">{user.email}</span>
                            </label>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground text-right">
                    {selectedUserIds.length} responsáveis selecionados
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Resumo dos Ativos</Label>
                  <div className="bg-slate-100 p-3 rounded-md text-sm text-slate-600">
                    Você está agendando a conferência de <strong>{selectedAssetIds.length}</strong> ativos. 
                    Os responsáveis receberão uma notificação para realizar a contagem física na data estipulada.
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsScheduleOpen(false)}>Cancelar</Button>
                <Button onClick={handleScheduleSubmit}>Confirmar Agendamento</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {pendingApprovalSchedules.length > 0 && (
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-blue-800">
              <CheckCircle2 className="h-5 w-5" />
              <h3 className="font-semibold">Aprovações de Inventário Pendentes ({pendingApprovalSchedules.length})</h3>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingApprovalSchedules.map(schedule => (
                <div key={schedule.id} className="flex items-center justify-between bg-white p-3 rounded-md border border-blue-100 shadow-sm">
                  <div>
                    <p className="text-base font-medium text-slate-700">Realizado em: {new Date(schedule.date).toLocaleDateString('pt-BR')}</p>
                    <p className="text-sm text-slate-500">{schedule.results?.length || 0} ativos verificados</p>
                    {schedule.notes && <p className="text-sm text-slate-500 italic mt-1">"{schedule.notes}"</p>}
                  </div>
                  <Button 
                    size="sm" 
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => setReviewingSchedule(schedule)}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Verificar
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {myPendingSchedules.length > 0 && (
        <Card className="bg-orange-50 border-orange-200">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-orange-800">
              <AlertCircle className="h-5 w-5" />
              <h3 className="font-semibold">Inventários Pendentes ({myPendingSchedules.length})</h3>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {myPendingSchedules.map(schedule => (
                <div key={schedule.id} className="flex items-center justify-between bg-white p-3 rounded-md border border-orange-100 shadow-sm">
                  <div>
                    <p className="text-base font-medium text-slate-700">Agendado para: {new Date(schedule.date).toLocaleDateString('pt-BR')}</p>
                    <p className="text-sm text-slate-500">{schedule.assetIds.length} ativos para conferir</p>
                    {schedule.notes && <p className="text-sm text-slate-500 italic mt-1">"{schedule.notes}"</p>}
                  </div>
                  <Button 
                    size="sm" 
                    className="bg-orange-600 hover:bg-orange-700 text-white"
                    onClick={() => setPerformingSchedule(schedule)}
                  >
                    <PlayCircle className="w-4 h-4 mr-2" />
                    Iniciar Contagem
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, plaqueta ou número do ativo..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="w-[280px]">
              <Select value={selectedCostCenter} onValueChange={setSelectedCostCenter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por Centro de Custo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Centros de Custo</SelectItem>
                  {costCenters.map((cc: any) => (
                    <SelectItem key={cc.id} value={cc.code}>
                      {cc.code} - {cc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Table className="text-base">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox 
                      checked={isAllSelected}
                      onCheckedChange={toggleAllAssets}
                    />
                  </TableHead>
                  <TableHead className="text-base">Nº Ativo</TableHead>
                  <TableHead className="text-base">Plaqueta</TableHead>
                  <TableHead className="text-base">Nome</TableHead>
                  <TableHead className="text-base">Centro de Custo</TableHead>
                  <TableHead className="text-base">Status</TableHead>
                  <TableHead className="text-base">Responsável</TableHead>
                  <TableHead className="text-right text-base">Valor</TableHead>
                  <TableHead className="text-center text-base">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAssets?.map((asset) => {
                  const activeSchedule = getActiveSchedule(asset.id);
                  const isAssignedToMe = activeSchedule && activeSchedule.status === 'pending' && currentUserId && activeSchedule.userIds.some(uid => String(uid) === String(currentUserId));
                  
                  return (
                  <TableRow 
                    key={asset.id} 
                    className={
                      selectedAssetIds.includes(asset.id) 
                        ? "bg-blue-50" 
                        : (activeSchedule 
                            ? (isAssignedToMe ? "bg-orange-50 border-l-4 border-l-orange-500 hover:bg-orange-100" : "opacity-50 bg-gray-100 pointer-events-none") 
                            : "")
                    }
                    title={activeSchedule && !isAssignedToMe ? "Agendado para outro usuário" : ""}
                  >
                    <TableCell>
                      <Checkbox 
                        checked={selectedAssetIds.includes(asset.id)}
                        onCheckedChange={() => toggleAssetSelection(asset.id)}
                        disabled={!!activeSchedule}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-base">{asset.assetNumber || "-"}</TableCell>
                    <TableCell className="text-base">{asset.tagNumber || "-"}</TableCell>
                    <TableCell>
                      <div className="font-medium text-base">{asset.name}</div>
                      <div className="text-sm text-muted-foreground truncate max-w-[300px]">{asset.description}</div>
                    </TableCell>
                    <TableCell className="text-base">
                      {(() => {
                         const ccCode = typeof asset.costCenter === 'object' ? (asset.costCenter as any).code : asset.costCenter;
                         const cc = costCenters.find(c => c.code === ccCode);
                         return cc ? `${cc.code} - ${cc.name}` : (ccCode || "-");
                      })()}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium capitalize
                        ${asset.status === 'concluido' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {asset.status?.replace('_', ' ')}
                      </span>
                    </TableCell>
                    <TableCell>
                      {activeSchedule ? (
                        <div className="flex flex-col gap-1">
                          {activeSchedule.userIds.map(uid => {
                            const responsibleUser = users.find(u => String(u.id) === String(uid));
                            return (
                              <span key={uid} className="text-sm text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 w-fit whitespace-nowrap">
                                {responsibleUser?.name || "Usuário..."}
                              </span>
                            );
                          })}
                          <span className="text-sm text-muted-foreground mt-0.5">
                            {new Date(activeSchedule.date).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-base">
                      {asset.value ? Number(asset.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      {isAssignedToMe && activeSchedule ? (
                        <Button 
                          size="sm" 
                          className="bg-orange-600 hover:bg-orange-700 text-white h-8 shadow-sm"
                          onClick={() => setPerformingSchedule(activeSchedule)}
                        >
                          <PlayCircle className="w-4 h-4 mr-1" /> Realizar
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" title="Gerar Etiqueta">
                          <QrCode className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )})}
                {(!filteredAssets || filteredAssets.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Nenhum ativo encontrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Histórico de Inventários Concluídos */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <ClipboardList className="h-5 w-5" />
              Histórico de Inventários Concluídos
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}>
              {isHistoryExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        {isHistoryExpanded && (
        <CardContent>
          <Table className="text-lg">
            <TableHeader>
              <TableRow>
                <TableHead className="text-lg">Data</TableHead>
                <TableHead className="text-lg">Responsáveis</TableHead>
                <TableHead className="text-lg">Aprovado Por</TableHead>
                <TableHead className="text-lg">Data Aprovação</TableHead>
                <TableHead className="text-right text-lg">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {completedSchedules.map(schedule => (
                <TableRow key={schedule.id}>
                  <TableCell className="text-lg">{new Date(schedule.date).toLocaleDateString('pt-BR')}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {schedule.userIds.map(uid => {
                        const u = users.find(user => String(user.id) === String(uid));
                        return <span key={uid} className="text-base text-muted-foreground">{u?.name || "Usuário"}</span>
                      })}
                    </div>
                  </TableCell>
                  <TableCell className="text-lg">{schedule.approvedBy || "-"}</TableCell>
                  <TableCell className="text-lg">{schedule.approvedAt ? new Date(schedule.approvedAt).toLocaleString('pt-BR') : "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" className="h-9 text-base px-4" onClick={() => handleExportScheduleResult(schedule)}>
                      <Download className="w-4 h-4 mr-2" />
                      Relatório
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {completedSchedules.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-lg">
                    Nenhum inventário concluído.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
        )}
      </Card>

      {/* Diálogo para Realizar Inventário */}
      <Dialog open={!!performingSchedule} onOpenChange={(open) => !open && setPerformingSchedule(null)}>
        <DialogContent className="w-full h-full max-w-full max-h-full md:max-w-[95vw] md:max-h-[95vh] p-0 md:p-6 flex flex-col gap-0">
          <DialogHeader className="p-4 pb-2 md:p-0 bg-white border-b md:border-none">
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Conferência de Inventário
            </DialogTitle>
            <DialogDescription className="hidden md:block">
              Utilize o leitor de QR Code ou digite a plaqueta para confirmar os ativos.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden flex flex-col bg-slate-50/50">
             {/* Área de Scan e Resumo */}
             <div className="bg-white p-4 border-b md:border md:rounded-lg flex flex-col gap-4 shrink-0 shadow-sm md:shadow-none md:m-0">
                <div className="w-full">
                    <Label htmlFor="scan-input">Leitura de Plaqueta / QR Code</Label>
                    <form onSubmit={handleScan} className="flex gap-2 mt-1">
                        <div className="relative flex-1">
                            <Button 
                                type="button" 
                                variant="ghost" 
                                size="icon" 
                                className="absolute left-0 top-0 h-10 w-10 text-muted-foreground hover:text-foreground z-10"
                                onClick={startScanning}
                            >
                                <QrCode className="h-5 w-5" />
                            </Button>
                            <Input 
                                id="scan-input"
                                value={scanInput}
                                onChange={(e) => setScanInput(e.target.value)}
                                placeholder="Bipe ou digite o código..."
                                className="pl-10 bg-white"
                                autoFocus
                                autoComplete="off"
                            />
                        </div>
                        <Button type="submit" size="icon" className="w-12 shrink-0">
                            <CheckCircle2 className="h-5 w-5" />
                        </Button>
                    </form>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm w-full">
                    <div className="flex flex-col items-center bg-slate-50 p-2 rounded border">
                        <span className="text-muted-foreground text-xs uppercase font-bold">Total</span>
                        <span className="font-bold text-lg">{performingSchedule?.assetIds.length || 0}</span>
                    </div>
                    <div className="flex flex-col items-center bg-green-50 p-2 rounded border border-green-100 text-green-700">
                        <span className="flex items-center gap-1 text-xs uppercase font-bold"><CheckCircle2 className="w-3 h-3" /> Feito</span>
                        <span className="font-bold text-lg">{Object.values(executionData).filter(d => d.verified).length}</span>
                    </div>
                    <div className="flex flex-col items-center bg-orange-50 p-2 rounded border border-orange-100 text-orange-700">
                        <span className="flex items-center gap-1 text-xs uppercase font-bold"><AlertCircle className="w-3 h-3" /> Falta</span>
                        <span className="font-bold text-lg">{Object.values(executionData).filter(d => !d.verified).length}</span>
                    </div>
                </div>
             </div>

             <div className="flex-1 overflow-auto bg-white md:border md:rounded-md md:mt-4">
             <Table className="text-base">
               <TableHeader>
                 <TableRow>
                   <TableHead className="w-[60px] text-center bg-slate-50 sticky top-0 z-10 text-base">Status</TableHead>
                   <TableHead className="bg-slate-50 sticky top-0 z-10 text-base">Ativo</TableHead>
                   <TableHead className="bg-slate-50 sticky top-0 z-10 text-base">Localização</TableHead>
                   <TableHead className="bg-slate-50 sticky top-0 z-10 min-w-[150px] text-base">Obs</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {performingSchedule && assets?.filter(a => performingSchedule.assetIds.includes(a.id)).map(asset => {
                   const isVerified = executionData[asset.id]?.verified;
                   return (
                   <TableRow key={asset.id} className={isVerified ? "bg-green-50/50" : ""}>
                     <TableCell className="text-center p-2 align-middle">
                       <div className="flex justify-center items-center">
                          {isVerified ? (
                              <CheckCircle2 className="w-8 h-8 text-green-600" />
                          ) : (
                              <Checkbox 
                                checked={false} 
                                onCheckedChange={(checked) => setExecutionData(prev => ({
                                  ...prev,
                                  [asset.id]: { ...prev[asset.id], verified: !!checked }
                                }))}
                                className="w-6 h-6 border-2"
                              /> 
                          )}
                       </div>
                     </TableCell>
                     <TableCell className="p-2 align-middle">
                        <div className="flex flex-col">
                            <span className="font-bold text-base">{asset.tagNumber}</span>
                            <span className="text-sm text-muted-foreground line-clamp-2 leading-tight">{asset.name}</span>
                            <span className="text-xs font-mono text-slate-400 mt-0.5">{asset.assetNumber}</span>
                        </div>
                     </TableCell>
                     <TableCell className="p-2 align-middle">
                        <div className="flex flex-col gap-1">
                            <span className="text-sm text-muted-foreground">
                                {typeof asset.costCenter === 'object' ? (asset.costCenter as any).code : asset.costCenter || "-"}
                            </span>
                        <Select 
                          value={executionData[asset.id]?.costCenter || ""} 
                          onValueChange={(val) => setExecutionData(prev => ({
                            ...prev,
                            [asset.id]: { ...prev[asset.id], costCenter: val }
                          }))}
                        >
                              <SelectTrigger className="h-8 text-sm w-full bg-white border-slate-200">
                                <SelectValue placeholder="Mover..." />
                          </SelectTrigger>
                          <SelectContent>
                            {costCenters?.map((cc: any) => (
                              <SelectItem key={cc.id} value={cc.code}>
                                    {cc.code}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        </div>
                     </TableCell>
                     <TableCell className="p-2 align-middle">
                      <Textarea
                          value={executionData[asset.id]?.observations || ""}
                          onChange={(e) => setExecutionData(prev => ({
                            ...prev,
                            [asset.id]: { ...prev[asset.id], observations: e.target.value }
                          }))}
                          placeholder="Obs..."
                        className="text-sm min-h-[60px] bg-white resize-none"
                        />
                     </TableCell>
                   </TableRow>
                 )})}
               </TableBody>
             </Table>
             </div>
          </div>
      
          <DialogFooter className="p-4 border-t bg-white md:bg-transparent mt-auto">
            <div className="flex gap-3 w-full">
                <Button variant="outline" className="flex-1 h-12 text-base" onClick={() => setPerformingSchedule(null)}>Voltar</Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700 h-12 text-base" onClick={() => performingSchedule && handleCompleteInventory(performingSchedule.id)}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Finalizar
            </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scanner Overlay */}
      {isScanning && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
            <div className="relative flex-1 bg-black flex items-center justify-center">
                <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                <div className="absolute inset-0 border-2 border-white/50 m-12 rounded-lg pointer-events-none"></div>
                <div className="absolute top-4 right-4 z-[101]">
                    <Button variant="ghost" size="icon" className="text-white bg-black/50 hover:bg-black/70 rounded-full" onClick={() => setIsScanning(false)}>
                        <X className="h-8 w-8" />
                    </Button>
                </div>
                {/* Botão de Simulação para Testes (caso a leitura nativa falhe) */}
                <div className="absolute bottom-20 left-0 right-0 flex justify-center">
                    <Button variant="secondary" size="sm" className="opacity-80 hover:opacity-100" onClick={() => {
                        const pending = performingSchedule?.assetIds.find(id => !executionData[id]?.verified);
                        if (pending) {
                            const asset = assets.find(a => a.id === pending);
                            if (asset) {
                                setScanInput(asset.tagNumber || asset.assetNumber || "");
                                setIsScanning(false);
                                toast.success("Leitura simulada (Teste)");
                            }
                        } else {
                            toast.info("Nenhum ativo pendente para simular.");
                        }
                    }}>
                        Simular Leitura (Teste)
                    </Button>
                </div>
            </div>
            <div className="p-6 bg-black text-white text-center font-medium">
                Aponte a câmera para o código
            </div>
        </div>
      )}

      {/* Diálogo para Validar/Aprovar Inventário */}
      <Dialog open={!!reviewingSchedule} onOpenChange={(open) => !open && setReviewingSchedule(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-blue-600" />
              Validar Inventário
            </DialogTitle>
            <DialogDescription>
              Verifique as alterações apontadas antes de aprovar. As mudanças de centro de custo serão aplicadas aos ativos.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto py-4">
             <Table className="text-base">
               <TableHeader>
                 <TableRow>
                   <TableHead className="w-[50px] text-center">
                      <Checkbox 
                        checked={reviewingSchedule?.results?.length === selectedForApproval.length && (reviewingSchedule?.results?.length || 0) > 0}
                        onCheckedChange={() => {
                          if (selectedForApproval.length === (reviewingSchedule?.results?.length || 0)) setSelectedForApproval([]);
                          else setSelectedForApproval(reviewingSchedule?.results?.map(r => r.assetId) || []);
                        }}
                      />
                   </TableHead>
                   <TableHead className="text-base">Ativo</TableHead>
                   <TableHead className="text-center text-base">Verificado</TableHead>
                   <TableHead className="text-base">Centro de Custo (Atual)</TableHead>
                   <TableHead className="text-base">Centro de Custo (Novo)</TableHead>
                   <TableHead className="text-base">Observações</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {reviewingSchedule?.results?.map((result, index) => {
                   const asset = assets.find(a => a.id === result.assetId);
                   const currentCC = typeof asset?.costCenter === 'object' ? (asset.costCenter as any).code : asset?.costCenter || "-";
                   const newCCCode = result.newCostCenter;
                   const newCC = costCenters.find(c => c.code === newCCCode);
                   const newCCLabel = newCC ? `${newCC.code} - ${newCC.name}` : newCCCode;
                   
                   const isChange = result.newCostCenter && result.newCostCenter !== currentCC;

                   return (
                     <TableRow key={index} className={`${isChange ? "bg-yellow-50" : ""} ${!selectedForApproval.includes(result.assetId) ? "opacity-60" : ""}`}>
                       <TableCell className="text-center">
                          <Checkbox 
                            checked={selectedForApproval.includes(result.assetId)}
                            onCheckedChange={() => toggleApproval(result.assetId)}
                          />
                       </TableCell>
                       <TableCell>
                          <div className="font-medium text-base">{asset?.name || "Ativo não encontrado"}</div>
                          <div className="text-sm text-muted-foreground">{asset?.assetNumber}</div>
                       </TableCell>
                       <TableCell className="text-center">
                          {result.verified ? <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto" /> : <XCircle className="w-5 h-5 text-red-600 mx-auto" />}
                       </TableCell>
                       <TableCell className="text-base">{currentCC}</TableCell>
                       <TableCell>
                          {result.newCostCenter ? (
                              <span className={`text-base ${isChange ? "font-bold text-orange-700" : ""}`}>
                                  {newCCLabel}
                              </span>
                          ) : (
                              <span className="text-muted-foreground italic text-base">Mantido</span>
                          )}
                       </TableCell>
                       <TableCell className="text-sm text-muted-foreground">
                          {result.observations || "-"}
                       </TableCell>
                     </TableRow>
                   );
                 })}
               </TableBody>
             </Table>
          </div>

          <DialogFooter className="gap-2 pt-4 border-t">
              <Button variant="destructive" onClick={() => reviewingSchedule && handleRejectInventory(reviewingSchedule)}>
                  <XCircle className="w-4 h-4 mr-2" />
                  Rejeitar (Retornar)
              </Button>
              <Button className="bg-green-600 hover:bg-green-700" onClick={() => {
                  if (reviewingSchedule) {
                    handleApproveInventory(reviewingSchedule);
                    setReviewingSchedule(null);
                  }
              }}>
                  <Check className="w-4 h-4 mr-2" />
                  Aprovar e Atualizar
              </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}