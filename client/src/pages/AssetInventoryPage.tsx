import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, updateDoc, doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, Download, QrCode, ClipboardList, Calendar as CalendarIcon, Users, CheckCircle2, AlertCircle, PlayCircle, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface InventoryResult {
  assetId: string;
  newCostCenter: string;
  verified: boolean;
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
}

export default function AssetInventoryPage() {
  const { user: authUser } = useAuth();
  const [user, setUser] = useState<any>(authUser);

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
  const [executionData, setExecutionData] = useState<Record<string, { verified: boolean; costCenter: string }>>({});
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

  const filteredAssets = assets?.filter(asset =>
    (asset.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (asset.tagNumber || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (asset.assetNumber || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Garante a leitura do ID independente do formato do objeto user (id, uid, openId, sub)
  const currentUserId = (user as any)?.id || (user as any)?.openId || (user as any)?.uid || (user as any)?.sub;

  const myPendingSchedules = schedules.filter(s => 
    s.status === 'pending' && currentUserId && s.userIds.some(uid => String(uid) === String(currentUserId))
  );

  // Inicializa os dados de execução quando o diálogo abre
  useEffect(() => {
    if (performingSchedule && assets) {
      const initialData: Record<string, { verified: boolean; costCenter: string }> = {};
      performingSchedule.assetIds.forEach(id => {
        const asset = assets.find(a => a.id === id);
        const currentCC = typeof asset?.costCenter === 'object' ? (asset.costCenter as any).code : asset?.costCenter;
        initialData[id] = {
          verified: true,
          costCenter: currentCC || ""
        };
      });
      setExecutionData(initialData);
    }
  }, [performingSchedule, assets]);

  const handleCompleteInventory = async (scheduleId: string) => {
    // Transforma os dados de execução em resultados para salvar
    const results: InventoryResult[] = Object.entries(executionData).map(([assetId, data]) => ({
      assetId,
      newCostCenter: data.costCenter,
      verified: data.verified
    }));

    const scheduleRef = doc(db, "inventory_schedules", scheduleId);
    await updateDoc(scheduleRef, { status: 'waiting_approval', results });

    setPerformingSchedule(null);
    toast.success("Contagem enviada para aprovação do solicitante!");
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
      status: 'pending'
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

  const handleExport = () => {
    if (!filteredAssets) return;
    
    const data = filteredAssets.map(asset => {
      const project = projects?.find(p => p.id === asset.projectId);
      return {
        "Nº Ativo": asset.assetNumber,
        "Plaqueta": asset.tagNumber,
        "Nome": asset.name,
        "Descrição": asset.description,
        "Valor": asset.value,
        "Data Aquisição": asset.startDate ? new Date(asset.startDate).toLocaleDateString() : "",
        "Status": asset.status,
        "Obra/Local": project?.name || "N/A"
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventário");
    XLSX.writeFile(wb, "inventario_ativos.xlsx");
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-slate-700 flex items-center gap-2">
          <ClipboardList className="h-8 w-8" />
          Agendamento de Inventário
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
                    <p className="text-sm font-medium text-slate-700">Agendado para: {new Date(schedule.date).toLocaleDateString('pt-BR')}</p>
                    <p className="text-xs text-slate-500">{schedule.assetIds.length} ativos para conferir</p>
                    {schedule.notes && <p className="text-xs text-slate-500 italic mt-1">"{schedule.notes}"</p>}
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
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox 
                      checked={isAllSelected}
                      onCheckedChange={toggleAllAssets}
                    />
                  </TableHead>
                  <TableHead>Nº Ativo</TableHead>
                  <TableHead>Plaqueta</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-center">Ações</TableHead>
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
                    <TableCell className="font-mono">{asset.assetNumber || "-"}</TableCell>
                    <TableCell>{asset.tagNumber || "-"}</TableCell>
                    <TableCell>
                      <div className="font-medium">{asset.name}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[300px]">{asset.description}</div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                        ${asset.status === 'concluido' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {asset.status?.replace('_', ' ')}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
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
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum ativo encontrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Diálogo para Realizar Inventário */}
      <Dialog open={!!performingSchedule} onOpenChange={(open) => !open && setPerformingSchedule(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Conferência de Inventário
            </DialogTitle>
            <DialogDescription>
              Verifique a presença física e o estado de conservação dos ativos listados abaixo.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto py-4">
             <Table>
               <TableHeader>
                 <TableRow>
                   <TableHead className="w-[50px]">OK</TableHead>
                   <TableHead>Nº Ativo</TableHead>
                   <TableHead>Nome</TableHead>
                   <TableHead>Centro de Custo (Atual)</TableHead>
                   <TableHead>Novo Centro de Custo</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {performingSchedule && assets?.filter(a => performingSchedule.assetIds.includes(a.id)).map(asset => (
                   <TableRow key={asset.id}>
                     <TableCell className="text-center">
                       <Checkbox 
                        checked={executionData[asset.id]?.verified ?? true} 
                        onCheckedChange={(checked) => setExecutionData(prev => ({
                          ...prev,
                          [asset.id]: { ...prev[asset.id], verified: !!checked }
                        }))}
                       /> 
                     </TableCell>
                     <TableCell className="font-mono">{asset.assetNumber}</TableCell>
                     <TableCell>
                        <div className="font-medium">{asset.name}</div>
                        <div className="text-xs text-muted-foreground">{asset.description}</div>
                     </TableCell>
                     <TableCell>
                        {typeof asset.costCenter === 'object' ? (asset.costCenter as any).code : asset.costCenter || "-"}
                     </TableCell>
                     <TableCell>
                        <Select 
                          value={executionData[asset.id]?.costCenter || ""} 
                          onValueChange={(val) => setExecutionData(prev => ({
                            ...prev,
                            [asset.id]: { ...prev[asset.id], costCenter: val }
                          }))}
                        >
                          <SelectTrigger className="h-8 w-[200px]">
                            <SelectValue placeholder="Manter atual" />
                          </SelectTrigger>
                          <SelectContent>
                            {costCenters?.map((cc: any) => (
                              <SelectItem key={cc.id} value={cc.code}>
                                {cc.code} - {cc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                     </TableCell>
                   </TableRow>
                 ))}
               </TableBody>
             </Table>
          </div>
      
          <DialogFooter className="mt-auto pt-4 border-t">
            <Button variant="outline" onClick={() => setPerformingSchedule(null)}>Cancelar</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={() => performingSchedule && handleCompleteInventory(performingSchedule.id)}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Enviar para Aprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}