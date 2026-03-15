import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, addDoc, updateDoc, doc, query, orderBy } from "firebase/firestore";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowRightLeft, History, AlertTriangle, Search, Plus, XCircle, Truck, ArrowLeft, Download, Clock, Check, X, ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import * as XLSX from "xlsx";

export default function AssetMovementsPage() {
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

  const [assets, setAssets] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [viewingMovement, setViewingMovement] = useState<any | null>(null);
  const [addresses, setAddresses] = useState<{ requester?: string; approver?: string; rejecter?: string }>({});
  const [loadingAddresses, setLoadingAddresses] = useState(false);

  // Buscar Ativos
  useEffect(() => {
    const q = query(collection(db, "assets"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAssets(data);
    });
    return () => unsubscribe();
  }, []);

  // Buscar Obras
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "projects"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(data);
    });
    return () => unsubscribe();
  }, []);

  // Buscar Centros de Custo
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "cost_centers"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCostCenters(data);
    });
    return () => unsubscribe();
  }, []);
  // Buscar Histórico de Movimentações
  useEffect(() => {
    const q = query(collection(db, "asset_movements"), orderBy("date", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMovements(data);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchAddress = async (location: { lat: number; lng: number } | null) => {
        if (!location) return null;
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.lat}&lon=${location.lng}&addressdetails=1`);
            if (!response.ok) return "Endereço não encontrado";
            const data = await response.json();
            return data.display_name || "Endereço não encontrado";
        } catch (error) {
            console.error("Error fetching address:", error);
            return "Erro ao buscar endereço";
        }
    };

    if (viewingMovement) {
        setLoadingAddresses(true);
        const fetchAll = async () => {
            const requester = await fetchAddress(viewingMovement.requesterLocation);
            const approver = await fetchAddress(viewingMovement.approverLocation);
            const rejecter = await fetchAddress(viewingMovement.rejecterLocation);
            
            const newAddresses: { requester?: string; approver?: string; rejecter?: string } = {};
            if (requester) newAddresses.requester = requester;
            if (approver) newAddresses.approver = approver;
            if (rejecter) newAddresses.rejecter = rejecter;
            
            setAddresses(newAddresses);
            setLoadingAddresses(false);
        };
        fetchAll();
    }
}, [viewingMovement]);

  const handleApproveMovement = async (movement: any) => {
    if (!movement.assetId) {
      toast.error("ID do ativo não encontrado na movimentação.");
      return;
    }

    const approverLocation = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
      );
    });

    try {
      const assetUpdate: any = { status: 'ativo' };
      if (movement.type === 'transfer_project') {
        assetUpdate.projectId = movement.destinationProjectId;
      } else if (movement.type === 'transfer_cost_center') {
        assetUpdate.costCenter = movement.destinationCostCenter;
      }

      await updateDoc(doc(db, "assets", movement.assetId), assetUpdate);

      const movementUpdate = {
        status: 'completed',
        approvedBy: user?.name || 'Sistema',
        approvedAt: new Date().toISOString(),
        approverLocation,
      };
      await updateDoc(doc(db, "asset_movements", movement.id), movementUpdate);

      toast.success("Recebimento de ativo aprovado com sucesso!");
    } catch (error) {
      console.error("Erro ao aprovar recebimento:", error);
      toast.error("Falha ao aprovar o recebimento do ativo.");
    }
  };

  const handleRejectMovement = async (movement: any) => {
    if (!movement.assetId) {
      toast.error("ID do ativo não encontrado na movimentação.");
      return;
    }

    const rejecterLocation = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
      );
    });

    try {
      await updateDoc(doc(db, "assets", movement.assetId), { status: 'ativo' });

      const movementUpdate = {
        status: 'rejected',
        rejectedBy: user?.name || 'Sistema',
        rejectedAt: new Date().toISOString(),
        rejecterLocation,
      };
      await updateDoc(doc(db, "asset_movements", movement.id), movementUpdate);

      toast.warning("Recebimento de ativo foi rejeitado.");
    } catch (error) {
      console.error("Erro ao rejeitar recebimento:", error);
      toast.error("Falha ao rejeitar o recebimento do ativo.");
    }
  };

  const [formData, setFormData] = useState({
    assetId: "",
    type: "",
    date: new Date().toISOString().split("T")[0],
    destinationProjectId: "",
    destinationCostCenter: "",
    value: "",
    percentage: "",
    reason: "",
  });

  const MOVEMENT_TYPES = [
    { value: "transfer_project", label: "Transferência entre Obras", type: "transfer" },
    { value: "transfer_cost_center", label: "Transferência de Centro de Custo", type: "transfer" },
    { value: "write_off_sale", label: "Baixa por Venda", type: "write_off" },
    { value: "write_off_obsolescence", label: "Baixa por Obsolescência", type: "write_off" },
    { value: "write_off_theft", label: "Baixa por Roubo/Furto", type: "write_off" },
    { value: "write_off_damage", label: "Baixa por Danos", type: "write_off" },
    { value: "write_off_partial", label: "Baixa Parcial", type: "partial_write_off" },
  ];

  const handleAssetSelect = (assetId: string) => {
    const asset = assets.find(a => a.id === assetId);
    if (asset) {
      setFormData(prev => ({
        ...prev,
        assetId,
        destinationProjectId: asset.projectId || "",
        destinationCostCenter: typeof asset.costCenter === 'object' ? asset.costCenter.code : asset.costCenter || "",
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.assetId || !formData.type) {
      toast.error("Preencha os campos obrigatórios.");
      return;
    }

    const requesterLocation = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => {
          toast.warning("Não foi possível obter a geolocalização. A movimentação será registrada sem ela.");
          resolve(null);
        },
      );
    });

    const asset = assets.find(a => a.id === formData.assetId);
    if (!asset) {
        toast.error("Ativo selecionado não encontrado.");
        return;
    }

    const movementType = MOVEMENT_TYPES.find(t => t.value === formData.type);
    const isTransfer = movementType?.type === 'transfer';

    const movementData = {
      ...formData,
      assetName: asset.name,
      assetNumber: asset.assetNumber,
      originProjectId: asset.projectId || null,
      originCostCenter: typeof asset.costCenter === 'object' ? asset.costCenter.code : asset.costCenter || null,
      movementCategory: movementType?.type || "other",
      createdAt: new Date().toISOString(),
      performedBy: user?.name || "Sistema",
      requesterLocation,
      status: isTransfer ? 'pending_approval' : 'completed',
    };

    try {
      // 1. Registrar Movimentação
      await addDoc(collection(db, "asset_movements"), movementData);

      // 2. Atualizar Ativo
      const updateData: any = {};
      
      if (isTransfer) {
        updateData.status = "em_transito";
      } else if (movementType?.type === "write_off") {
        updateData.status = "baixado";
        updateData.writeOffDate = formData.date;
        updateData.writeOffReason = formData.reason;
        updateData.writeOffValue = formData.value;
      } else if (movementType?.type === "partial_write_off") {
        const currentValue = Number(asset.value || 0);
        const reduction = Number(formData.value || 0);
        updateData.value = Math.max(0, currentValue - reduction);
      }

      if (Object.keys(updateData).length > 0) {
        await updateDoc(doc(db, "assets", formData.assetId), updateData);
      }

      toast.success(`Movimentação registrada! ${isTransfer ? 'Aguardando aprovação do recebimento.' : ''}`);
      setIsModalOpen(false);
      setFormData({
        assetId: "",
        type: "",
        date: new Date().toISOString().split("T")[0],
        destinationProjectId: "",
        destinationCostCenter: "",
        value: "",
        percentage: "",
        reason: "",
      });
    } catch (error) {
      console.error(error);
      toast.error("Erro ao registrar movimentação.");
    }
  };

  const getProjectName = (id: string) => projects.find(p => String(p.id) === String(id))?.name || "—";
  const getProjectLocation = (id: string) => projects.find(p => String(p.id) === String(id))?.location || "";
  const getCostCenterName = (code: string) => {
    const cc = costCenters?.find((c: any) => c.code === code);
    return cc ? `${cc.code} - ${cc.name}` : code || "—";
  };
  const getCostCenterResponsible = (code: string) => {
    if (!code) return "";
    const cc = costCenters?.find((c: any) => c.code === code);
    return cc?.responsible || "";
  };
  const getCostCenterDepartment = (code: string) => {
    if (!code) return "";
    const cc = costCenters?.find((c: any) => c.code === code);
    return cc?.department || "";
  };

  const statusLabels: { [key: string]: string } = {
    pending_approval: "Pendente",
    completed: "Concluído",
    rejected: "Rejeitado"
  };

  const filteredMovements = movements.filter(m => {
    const typeLabel = (MOVEMENT_TYPES.find(t => t.value === m.type)?.label || "").toLowerCase();
    const statusLabel = (statusLabels[m.status] || "").toLowerCase();
    const searchTermLower = searchTerm.toLowerCase();

    return m.assetName?.toLowerCase().includes(searchTermLower) ||
      m.assetNumber?.toLowerCase().includes(searchTermLower) ||
      typeLabel.includes(searchTermLower) ||
      statusLabel.includes(searchTermLower);
  });

  const handleExportExcel = () => {
    if (!filteredMovements || filteredMovements.length === 0) {
      toast.error("Não há movimentações para exportar.");
      return;
    }

    const statusLabels: { [key: string]: string } = {
      pending_approval: "Pendente",
      completed: "Concluído",
      rejected: "Rejeitado"
    };

    const data = filteredMovements.map(m => {
      const typeLabel = MOVEMENT_TYPES.find(t => t.value === m.type)?.label || m.type;
      const origin = m.originProjectId ? `Obra: ${getProjectName(m.originProjectId)}` : 
                     m.originCostCenter ? `CC: ${getCostCenterName(m.originCostCenter)}` : "-";
      
      let destination = "-";
      if (m.type === "transfer_project") destination = `Obra: ${getProjectName(m.destinationProjectId)}`;
      else if (m.type === "transfer_cost_center") destination = `CC: ${getCostCenterName(m.destinationCostCenter)}`;
      else if (m.movementCategory === "write_off") destination = "Baixado";
      else if (m.movementCategory === "partial_write_off") destination = "Baixa Parcial";

      return {
        "Data": new Date(m.date).toLocaleDateString('pt-BR'),
        "Ativo": `${m.assetNumber} - ${m.assetName}`,
        "Tipo": typeLabel,
        "Origem": origin,
        "Destino": destination,
        "Valor Movimentado (R$)": m.value ? Number(m.value) : 0,
        "Status": statusLabels[m.status] || m.status,
        "Justificativa": m.reason || "",
        "Solicitante": m.performedBy || "-",
        "Aprovador": m.status === 'pending_approval'
          ? getCostCenterResponsible(m.destinationCostCenter) || "Aguardando Aprovação"
          : (m.approvedBy || (m.rejectedBy ? `Rejeitado por ${m.rejectedBy}` : "-")),
        "Local Solicitante": m.requesterLocation ? `${m.requesterLocation.lat}, ${m.requesterLocation.lng}` : "-",
        "Local Aprovador/Rejeitador": m.approverLocation ? `${m.approverLocation.lat}, ${m.approverLocation.lng}` : (m.rejecterLocation ? `${m.rejecterLocation.lat}, ${m.rejecterLocation.lng}` : "-")
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movimentações");
    XLSX.writeFile(wb, `movimentacoes_ativos_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Relatório exportado com sucesso!");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/assets">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <h1 className="text-3xl font-bold text-slate-700">Movimentação de Ativos</h1>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportExcel}>
            <Download className="mr-2 h-4 w-4" />
            Exportar Excel
          </Button>
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus size={20} />
                Nova Movimentação
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Registrar Movimentação ou Baixa</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-sm font-medium mb-1 block">Selecione o Ativo</label>
                    <Select 
                      value={formData.assetId} 
                      onValueChange={(v) => {
                          setFormData(prev => ({ ...prev, assetId: v }));
                          handleAssetSelect(v);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Buscar ativo..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {assets
                          .filter(a => a.status !== "baixado" && a.status !== "em_transito")
                          .map((asset) => (
                          <SelectItem key={asset.id} value={asset.id}>
                            {asset.assetNumber} - {asset.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-1">
                    <label className="text-sm font-medium mb-1 block">Tipo de Movimentação</label>
                    <Select value={formData.type} onValueChange={(v) => setFormData(prev => ({ ...prev, type: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {MOVEMENT_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-1">
                    <label className="text-sm font-medium mb-1 block">Data da Ocorrência</label>
                    <Input 
                      type="date" 
                      value={formData.date}
                      onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Campos condicionais baseados no tipo */}
                {formData.type === "transfer_project" && (
                  <div className="bg-blue-50 p-4 rounded-md border border-blue-100">
                    <h4 className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
                      <Truck size={16} /> Destino da Transferência
                    </h4>
                    <label className="text-sm font-medium mb-1 block">Obra de Destino</label>
                    <Select value={formData.destinationProjectId} onValueChange={(v) => setFormData(prev => ({ ...prev, destinationProjectId: v }))}>
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Selecione a obra de destino" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id.toString()}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {formData.type === "transfer_cost_center" && (
                  <div className="bg-blue-50 p-4 rounded-md border border-blue-100">
                    <h4 className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
                      <ArrowRightLeft size={16} /> Novo Centro de Custo
                    </h4>
                    <label className="text-sm font-medium mb-1 block">Centro de Custo de Destino</label>
                    <Select value={formData.destinationCostCenter} onValueChange={(v) => setFormData(prev => ({ ...prev, destinationCostCenter: v }))}>
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Selecione o centro de custo" />
                      </SelectTrigger>
                      <SelectContent>
                        {costCenters?.map((cc: any) => (
                          <SelectItem key={cc.id} value={cc.code}>
                            {cc.code} - {cc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {formData.type.startsWith("write_off") && (
                  <div className="bg-red-50 p-4 rounded-md border border-red-100">
                    <h4 className="text-sm font-semibold text-red-800 mb-3 flex items-center gap-2">
                      <AlertTriangle size={16} /> Detalhes da Baixa
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      {formData.type === "write_off_sale" && (
                        <div>
                          <label className="text-sm font-medium mb-1 block">Valor de Venda (R$)</label>
                          <Input 
                            type="number" 
                            placeholder="0,00"
                            className="bg-white"
                            value={formData.value}
                            onChange={(e) => setFormData(prev => ({ ...prev, value: e.target.value }))}
                          />
                        </div>
                      )}
                      {formData.type === "write_off_partial" && (
                        <>
                          <div>
                            <label className="text-sm font-medium mb-1 block">Percentual da Baixa (%)</label>
                            <Input 
                              type="number" 
                              placeholder="0%"
                              className="bg-white"
                              value={formData.percentage}
                              onChange={(e) => {
                                const pct = e.target.value;
                                const asset = assets.find(a => a.id === formData.assetId);
                                let val = formData.value;
                                if (asset && asset.value) {
                                    val = (Number(asset.value) * (Number(pct) / 100)).toFixed(2);
                                }
                                setFormData(prev => ({ ...prev, percentage: pct, value: val }));
                              }}
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium mb-1 block">Valor da Baixa (R$)</label>
                            <Input 
                              type="number" 
                              placeholder="0,00"
                              className="bg-white"
                              value={formData.value}
                              onChange={(e) => {
                                const val = e.target.value;
                                const asset = assets.find(a => a.id === formData.assetId);
                                let pct = formData.percentage;
                                if (asset && asset.value && Number(asset.value) > 0) {
                                    pct = ((Number(val) / Number(asset.value)) * 100).toFixed(2);
                                }
                                setFormData(prev => ({ ...prev, value: val, percentage: pct }));
                              }}
                            />
                          </div>
                        </>
                      )}
                      <div className={formData.type === "write_off_sale" ? "" : "col-span-2"}>
                        <label className="text-sm font-medium mb-1 block">Justificativa / Observações</label>
                        <Textarea 
                          placeholder="Descreva o motivo da baixa..."
                          className="bg-white"
                          value={formData.reason}
                          onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <Button type="submit" className="w-full">Confirmar Movimentação</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-4 bg-white p-4 rounded-lg border shadow-sm">
        <Search className="text-gray-400" />
        <Input 
          placeholder="Buscar por número do ativo, nome ou tipo..." 
          className="border-none shadow-none focus-visible:ring-0"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Diálogo de Visualização de Detalhes */}
      <Dialog open={!!viewingMovement} onOpenChange={(open) => !open && setViewingMovement(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes da Movimentação</DialogTitle>
            {viewingMovement && (
              <DialogDescription>
                ID da Movimentação: {viewingMovement.id}
              </DialogDescription>
            )}
          </DialogHeader>
          {viewingMovement && (
            <div className="py-4 space-y-4 text-sm">
              <div className="p-4 bg-slate-50 rounded-lg border">
                <h4 className="font-semibold text-base mb-2">Ativo Movimentado</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Nome</p>
                    <p className="font-medium">{viewingMovement.assetName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Número</p>
                    <p className="font-medium">{viewingMovement.assetNumber}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-lg border">
                  <h4 className="font-semibold text-base mb-2">Detalhes</h4>
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Tipo</p>
                      <p className="font-medium">{MOVEMENT_TYPES.find(t => t.value === viewingMovement.type)?.label}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Data</p>
                      <p className="font-medium">{new Date(viewingMovement.date).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Solicitante</p>
                      <p className="font-medium">{viewingMovement.performedBy}</p>
                      {viewingMovement.requesterLocation && (
                        <div className="mt-1">
                          {loadingAddresses ? <span className="text-[10px] italic">Buscando endereço...</span> : (
                            <a
                              href={`https://www.google.com/maps?q=${viewingMovement.requesterLocation.lat},${viewingMovement.requesterLocation.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-blue-600 hover:underline block leading-tight"
                            >
                              {addresses.requester || "Ver no Mapa"}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-lg border">
                  <h4 className="font-semibold text-base mb-2">Status</h4>
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Status Atual</p>
                      <p className="font-bold text-lg">{statusLabels[viewingMovement.status]}</p>
                    </div>
                    {viewingMovement.status === 'pending_approval' && viewingMovement.destinationCostCenter && (
                      <div>
                        <p className="text-xs text-muted-foreground">Aguardando aprovação de</p>
                        <p className="font-medium">
                          {getCostCenterResponsible(viewingMovement.destinationCostCenter) || "Responsável não definido"}
                        </p>
                      </div>
                    )}
                    {viewingMovement.approvedBy && (
                      <div>
                        <p className="text-xs text-muted-foreground">Aprovado por</p>
                        <p className="font-medium">{viewingMovement.approvedBy} em {new Date(viewingMovement.approvedAt).toLocaleString('pt-BR')}</p>
                        {viewingMovement.approverLocation && (
                          <div className="mt-1">
                            {loadingAddresses ? <span className="text-[10px] italic">Buscando endereço...</span> : (
                              <a
                                href={`https://www.google.com/maps?q=${viewingMovement.approverLocation.lat},${viewingMovement.approverLocation.lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] text-blue-600 hover:underline block leading-tight"
                              >
                                {addresses.approver || "Ver no Mapa"}
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {viewingMovement.rejectedBy && (
                      <div>
                        <p className="text-xs text-muted-foreground">Rejeitado por</p>
                        <p className="font-medium">{viewingMovement.rejectedBy} em {new Date(viewingMovement.rejectedAt).toLocaleString('pt-BR')}</p>
                        {viewingMovement.rejecterLocation && (
                          <div className="mt-1">
                            {loadingAddresses ? <span className="text-[10px] italic">Buscando endereço...</span> : (
                              <a
                                href={`https://www.google.com/maps?q=${viewingMovement.rejecterLocation.lat},${viewingMovement.rejecterLocation.lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] text-blue-600 hover:underline block leading-tight"
                              >
                                {addresses.rejecter || "Ver no Mapa"}
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-lg border">
                <h4 className="font-semibold text-base mb-2">Origem e Destino</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Origem</p>
                    {viewingMovement.type.includes('cost_center') ? (
                      <>
                        <p className="font-medium leading-tight">{`CC: ${getCostCenterName(viewingMovement.originCostCenter)}`}</p>
                        <p className="text-xs text-muted-foreground leading-tight">Local: {getCostCenterDepartment(viewingMovement.originCostCenter) || "-"}</p>
                        <p className="text-xs text-muted-foreground leading-tight">Responsável: {getCostCenterResponsible(viewingMovement.originCostCenter) || "-"}</p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium leading-tight">{`Obra: ${getProjectName(viewingMovement.originProjectId)}`}</p>
                        <p className="text-xs text-muted-foreground leading-tight">Local: {getProjectLocation(viewingMovement.originProjectId)}</p>
                      </>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Destino</p>
                    {viewingMovement.type === 'transfer_project' ? (
                      <>
                        <p className="font-medium leading-tight">{`Obra: ${getProjectName(viewingMovement.destinationProjectId)}`}</p>
                        <p className="text-xs text-muted-foreground leading-tight">Local: {getProjectLocation(viewingMovement.destinationProjectId)}</p>
                      </>
                    ) : viewingMovement.type === 'transfer_cost_center' ? (
                      <>
                        <p className="font-medium leading-tight">{`CC: ${getCostCenterName(viewingMovement.destinationCostCenter)}`}</p>
                        <p className="text-xs text-muted-foreground leading-tight">Local: {getCostCenterDepartment(viewingMovement.destinationCostCenter) || "-"}</p>
                        <p className="text-xs text-muted-foreground leading-tight">Responsável: {getCostCenterResponsible(viewingMovement.destinationCostCenter) || "-"}</p>
                      </>
                    ) : (
                      <p className="font-medium leading-tight">{viewingMovement.movementCategory.includes('write_off') ? 'Baixa' : '-'}</p>
                    )}
                  </div>
                </div>
              </div>

              {(viewingMovement.value || viewingMovement.reason) && (
                <div className="p-4 bg-slate-50 rounded-lg border">
                  <h4 className="font-semibold text-base mb-2">Informações Adicionais</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {viewingMovement.value && (
                      <div>
                        <p className="text-xs text-muted-foreground">Valor Movimentado</p>
                        <p className="font-medium">R$ {Number(viewingMovement.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>
                    )}
                    {viewingMovement.reason && (
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">Justificativa</p>
                        <p className="font-medium">{viewingMovement.reason}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Movimentações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Destino / Detalhes</TableHead>
                <TableHead>Solicitante</TableHead>
                <TableHead>Aprovador</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">Carregando...</TableCell>
                </TableRow>
              ) : filteredMovements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhuma movimentação encontrada.</TableCell>
                </TableRow>
              ) : (
                filteredMovements.map((movement) => {
                  const typeInfo = MOVEMENT_TYPES.find(t => t.value === movement.type);
                  const isPendingApproval = movement.status === 'pending_approval';
                  const isWriteOff = movement.movementCategory === "write_off";
                  const isPartialWriteOff = movement.movementCategory === "partial_write_off";

                  let isApprover = false;
                  if (isPendingApproval && user) {
                    if (movement.type === 'transfer_cost_center') {
                        const userRole = (user as any)?.role;
                        if (userRole === 'admin' || userRole === 'diretoria') {
                            isApprover = true;
                        } else {
                        const destCC = costCenters.find(cc => cc.code === movement.destinationCostCenter);
                        if (destCC && (destCC.responsible === user.name || destCC.responsibleEmail === user.email)) {
                            isApprover = true;
                        }
                        }
                    }
                    // TODO: Adicionar lógica para aprovação de transferência entre obras se necessário
                  }

                  return (
                    <TableRow 
                      key={movement.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => setViewingMovement(movement)}
                    >
                      <TableCell>{new Date(movement.date).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell>
                        <div className="font-medium">{movement.assetNumber}</div>
                        <div className="text-xs text-muted-foreground">{movement.assetName}</div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          movement.movementCategory === "transfer" ? 'bg-blue-100 text-blue-800' : 
                          isWriteOff ? 'bg-red-100 text-red-800' : 
                          isPartialWriteOff ? 'bg-orange-100 text-orange-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {typeInfo?.label || movement.type}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {movement.originProjectId ? `Obra: ${getProjectName(movement.originProjectId)}` : 
                         movement.originCostCenter ? `CC: ${getCostCenterName(movement.originCostCenter)}` : "-"}
                      </TableCell>
                      <TableCell>
                        {movement.type === "transfer_project" && (
                          <div className="flex items-center gap-1 text-blue-600">
                            <ArrowRightLeft size={14} />
                            <span>{getProjectName(movement.destinationProjectId)}</span>
                          </div>
                        )}
                        {movement.type === "transfer_cost_center" && (
                          <div className="flex items-center gap-1 text-blue-600">
                            <ArrowRightLeft size={14} />
                            <span>{getCostCenterName(movement.destinationCostCenter)}</span>
                          </div>
                        )}
                        {isWriteOff && (
                          <div className="flex flex-col">
                            <span className="text-red-600 flex items-center gap-1">
                              <XCircle size={14} /> Baixado
                            </span>
                            {movement.reason && <span className="text-xs text-gray-500 italic">{movement.reason}</span>}
                          </div>
                        )}
                        {isPartialWriteOff && (
                          <div className="flex flex-col">
                            <span className="text-orange-600 flex items-center gap-1">
                              <AlertTriangle size={14} /> Baixa Parcial
                            </span>
                            {movement.reason && <span className="text-xs text-gray-500 italic">{movement.reason}</span>}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {movement.performedBy || "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {movement.status === 'pending_approval' ? (
                          <span className="font-medium text-slate-700">
                            {movement.type === 'transfer_cost_center' ? getCostCenterResponsible(movement.destinationCostCenter) : "Aprovação"}
                          </span>
                        ) : (
                          movement.approvedBy || (movement.rejectedBy ? `Rejeitado por ${movement.rejectedBy}` : "-")
                        )}
                      </TableCell>
                      <TableCell>
                        {movement.status === 'pending_approval' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            <Clock size={14} />
                            Pendente
                          </span>
                        )}
                        {movement.status === 'completed' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <Check size={14} />
                            Concluído
                          </span>
                        )}
                        {movement.status === 'rejected' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            <X size={14} />
                            Rejeitado
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isPendingApproval && isApprover && (
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-green-600 hover:bg-green-100 hover:text-green-700" onClick={(e) => { e.stopPropagation(); handleApproveMovement(movement); }}><ThumbsUp size={16} /></Button>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-600 hover:bg-red-100 hover:text-red-700" onClick={(e) => { e.stopPropagation(); handleRejectMovement(movement); }}><ThumbsDown size={16} /></Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}