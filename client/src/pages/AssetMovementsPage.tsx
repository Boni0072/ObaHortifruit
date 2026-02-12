import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, addDoc, updateDoc, doc, query, orderBy } from "firebase/firestore";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowRightLeft, History, AlertTriangle, Search, Plus, XCircle, Truck, ArrowLeft, Download } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import * as XLSX from "xlsx";

export default function AssetMovementsPage() {
  const [assets, setAssets] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: costCenters } = trpc.accounting.listCostCenters.useQuery();

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

  const [formData, setFormData] = useState({
    assetId: "",
    type: "",
    date: new Date().toISOString().split("T")[0],
    destinationProjectId: "",
    destinationCostCenter: "",
    value: "",
    reason: "",
  });

  const MOVEMENT_TYPES = [
    { value: "transfer_project", label: "Transferência entre Obras", type: "transfer" },
    { value: "transfer_cost_center", label: "Transferência de Centro de Custo", type: "transfer" },
    { value: "write_off_sale", label: "Baixa por Venda", type: "write_off" },
    { value: "write_off_obsolescence", label: "Baixa por Obsolescência", type: "write_off" },
    { value: "write_off_theft", label: "Baixa por Roubo/Furto", type: "write_off" },
    { value: "write_off_damage", label: "Baixa por Danos", type: "write_off" },
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

    const asset = assets.find(a => a.id === formData.assetId);
    if (!asset) return;

    const movementType = MOVEMENT_TYPES.find(t => t.value === formData.type);

    const movementData = {
      ...formData,
      assetName: asset.name,
      assetNumber: asset.assetNumber,
      originProjectId: asset.projectId || null,
      originCostCenter: typeof asset.costCenter === 'object' ? asset.costCenter.code : asset.costCenter || null,
      movementCategory: movementType?.type || "other",
      createdAt: new Date().toISOString(),
    };

    try {
      // 1. Registrar Movimentação
      await addDoc(collection(db, "asset_movements"), movementData);

      // 2. Atualizar Ativo com base no tipo
      const updateData: any = {};
      
      if (formData.type === "transfer_project") {
        updateData.projectId = formData.destinationProjectId;
      } else if (formData.type === "transfer_cost_center") {
        updateData.costCenter = formData.destinationCostCenter;
      } else if (movementType?.type === "write_off") {
        updateData.status = "baixado";
        updateData.writeOffDate = formData.date;
        updateData.writeOffReason = formData.reason;
        updateData.writeOffValue = formData.value;
      }

      await updateDoc(doc(db, "assets", formData.assetId), updateData);

      toast.success("Movimentação registrada com sucesso!");
      setIsModalOpen(false);
      setFormData({
        assetId: "",
        type: "",
        date: new Date().toISOString().split("T")[0],
        destinationProjectId: "",
        destinationCostCenter: "",
        value: "",
        reason: "",
      });
    } catch (error) {
      console.error(error);
      toast.error("Erro ao registrar movimentação.");
    }
  };

  const getProjectName = (id: string) => projects.find(p => String(p.id) === String(id))?.name || "—";
  const getCostCenterName = (code: string) => {
    const cc = costCenters?.find((c: any) => c.code === code);
    return cc ? `${cc.code} - ${cc.name}` : code || "—";
  };

  const filteredMovements = movements.filter(m => 
    m.assetName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.assetNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (MOVEMENT_TYPES.find(t => t.value === m.type)?.label || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExportExcel = () => {
    if (!filteredMovements || filteredMovements.length === 0) {
      toast.error("Não há movimentações para exportar.");
      return;
    }

    const data = filteredMovements.map(m => {
      const typeLabel = MOVEMENT_TYPES.find(t => t.value === m.type)?.label || m.type;
      const origin = m.originProjectId ? `Obra: ${getProjectName(m.originProjectId)}` : 
                     m.originCostCenter ? `CC: ${getCostCenterName(m.originCostCenter)}` : "-";
      
      let destination = "-";
      if (m.type === "transfer_project") destination = `Obra: ${getProjectName(m.destinationProjectId)}`;
      else if (m.type === "transfer_cost_center") destination = `CC: ${getCostCenterName(m.destinationCostCenter)}`;
      else if (m.movementCategory === "write_off") destination = "Baixado";

      return {
        "Data": new Date(m.date).toLocaleDateString('pt-BR'),
        "Ativo": `${m.assetNumber} - ${m.assetName}`,
        "Tipo": typeLabel,
        "Origem": origin,
        "Destino": destination,
        "Valor (R$)": m.value ? Number(m.value) : 0,
        "Justificativa": m.reason || ""
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
                          .filter(a => a.status !== "baixado") // Não mostrar ativos já baixados
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">Carregando...</TableCell>
                </TableRow>
              ) : filteredMovements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma movimentação encontrada.</TableCell>
                </TableRow>
              ) : (
                filteredMovements.map((movement) => {
                  const typeInfo = MOVEMENT_TYPES.find(t => t.value === movement.type);
                  const isTransfer = movement.movementCategory === "transfer";
                  const isWriteOff = movement.movementCategory === "write_off";

                  return (
                    <TableRow key={movement.id}>
                      <TableCell>{new Date(movement.date).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell>
                        <div className="font-medium">{movement.assetNumber}</div>
                        <div className="text-xs text-muted-foreground">{movement.assetName}</div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          isTransfer ? 'bg-blue-100 text-blue-800' : 
                          isWriteOff ? 'bg-red-100 text-red-800' : 
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