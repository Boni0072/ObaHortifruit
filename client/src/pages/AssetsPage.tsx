import React, { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, CheckCircle, AlertTriangle, Pencil, Eye, ChevronDown, ChevronUp, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AssetCalculations from "./AssetCalculations";
import * as XLSX from "xlsx";

export default function AssetsPage() {
  const utils = trpc.useUtils();
  const [projects, setProjects] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "projects"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(data);
    });
    return () => unsubscribe();
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Estado para visualização de detalhes (movido para cima para permitir uso nas queries)
  const [viewOpen, setViewOpen] = useState(false);
  const [viewingAsset, setViewingAsset] = useState<any>(null);

  const [filters, setFilters] = useState({
    assetNumber: "",
    tagNumber: "",
    description: "",
    costCenter: "",
    projectId: "all",
  });

  const [assets, setAssets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "assets"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAssets(data);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const { data: projectExpenses, refetch: refetchExpenses } = trpc.expenses.listByProject.useQuery(
    { projectId: filters.projectId === "all" ? "all" : filters.projectId }
  );

  const { data: accountingAccounts } = trpc.accounting.listAccounts.useQuery();
  const { data: assetClasses } = trpc.accounting.listAssetClasses.useQuery();
  const { data: costCenters } = trpc.accounting.listCostCenters.useQuery();

  const updateExpenseMutation = trpc.expenses.update.useMutation();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    projectId: "",
    assetNumber: "",
    name: "",
    description: "",
    tagNumber: "",
    value: "",
    quantity: "1",
    startDate: new Date().toISOString().split("T")[0],
    notes: "",
    accountingAccount: "",
    assetClass: "",
    usefulLife: "",
    corporateUsefulLife: "",
    depreciationAccountCode: "",
    amortizationAccountCode: "",
    resultAccountCode: "",
    costCenter: "",
  });

  // Estado para o processo de Ativação (Transferência CIP -> Imobilizado)
  const [activationOpen, setActivationOpen] = useState(false);
  const [assetToActivate, setAssetToActivate] = useState<any>(null);
  const [activationData, setActivationData] = useState({
    availabilityDate: new Date().toISOString().split("T")[0],
    residualValue: "0",
  });

  const [expandedSections, setExpandedSections] = useState({
    details: true,
    composition: true,
    calculations: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleView = (asset: any) => {
    setViewingAsset(asset);
    setViewOpen(true);
  };

  const { data: nextAssetNumber } = trpc.assets.getNextNumber.useQuery(undefined, {
    enabled: open && !formData.assetNumber,
  });

  useEffect(() => {
    if (open && !formData.assetNumber && nextAssetNumber) {
      setFormData(prev => ({ ...prev, assetNumber: nextAssetNumber }));
    }
  }, [open, formData.assetNumber, nextAssetNumber]);

  const handleEdit = (asset: any) => {
    let formattedDate = "";
    try {
      formattedDate = asset.startDate ? new Date(asset.startDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
    } catch (e) {
      formattedDate = new Date().toISOString().split("T")[0];
    }
    setFormData({
      projectId: asset.projectId || "",
      assetNumber: asset.assetNumber || "",
      name: asset.name,
      description: asset.description || "",
      tagNumber: asset.tagNumber || "",
      value: asset.value ? String(asset.value) : "",
      quantity: asset.quantity ? String(asset.quantity) : "1",
      startDate: formattedDate,
      notes: asset.notes || "",
      accountingAccount: asset.accountingAccount || "",
      assetClass: asset.assetClass || "",
      usefulLife: asset.usefulLife ? String(asset.usefulLife) : "",
      corporateUsefulLife: asset.corporateUsefulLife ? String(asset.corporateUsefulLife) : "",
      depreciationAccountCode: asset.depreciationAccountCode || "",
      amortizationAccountCode: asset.amortizationAccountCode || "",
      resultAccountCode: asset.resultAccountCode || "",
      costCenter: (typeof asset.costCenter === 'object' ? asset.costCenter?.code : asset.costCenter) || "",
    });
    setEditingId(asset.id);
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.projectId) {
      toast.error("Selecione uma obra para o ativo");
      return;
    }

    const payload = {
      projectId: formData.projectId,
      assetNumber: formData.assetNumber,
      name: formData.name,
      description: formData.description || "",
      tagNumber: formData.tagNumber || "",
      value: formData.value ? Number(formData.value) : 0,
      quantity: formData.quantity ? Number(formData.quantity) : 1,
      startDate: new Date(formData.startDate).toISOString(),
      notes: formData.notes || "",
      accountingAccount: formData.accountingAccount || "",
      assetClass: formData.assetClass || "",
      usefulLife: formData.usefulLife ? Number(formData.usefulLife) : 0,
      corporateUsefulLife: formData.corporateUsefulLife ? Number(formData.corporateUsefulLife) : 0,
      depreciationAccountCode: formData.depreciationAccountCode || "",
      amortizationAccountCode: formData.amortizationAccountCode || "",
      resultAccountCode: formData.resultAccountCode || "",
      costCenter: formData.costCenter || "",
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, "assets", editingId), payload);
        toast.success("Ativo atualizado com sucesso!");
      } else {
        await addDoc(collection(db, "assets"), {
          ...payload,
          status: "planejamento",
          createdAt: new Date().toISOString()
        });
        toast.success("Ativo criado com sucesso!");
      }
      setFormData({ projectId: "", assetNumber: "", name: "", description: "", tagNumber: "", value: "", quantity: "1", startDate: new Date().toISOString().split("T")[0], notes: "", accountingAccount: "", assetClass: "", usefulLife: "", corporateUsefulLife: "", depreciationAccountCode: "", amortizationAccountCode: "", resultAccountCode: "", costCenter: "" });
      setEditingId(null);
      setOpen(false);
      utils.assets.getNextNumber.invalidate(); // Atualiza a sequência para o próximo cadastro
      
      // If an asset was being viewed and it was the one just edited, update viewingAsset
      if (editingId && viewingAsset && viewingAsset.id === editingId) {
        const updatedViewingAsset = {
          ...viewingAsset,
          ...payload,
          status: viewingAsset.status
        };
        if (updatedViewingAsset) {
          setViewingAsset(updatedViewingAsset);
        }
      }
    } catch (error) {
      toast.error(editingId ? "Erro ao atualizar ativo" : "Erro ao criar ativo");
    }
  };

  const handleStatusChange = async (asset: any, newStatus: string) => {
    // Intercepta a conclusão para realizar o processo de Ativação (CPC 27)
    if (newStatus === "concluido" && asset.status !== "concluido") {
      setAssetToActivate(asset);
      setActivationOpen(true);
      return;
    }

    try {
      await updateDoc(doc(db, "assets", asset.id), {
        status: newStatus as "planejamento" | "em_desenvolvimento" | "concluido" | "parado",
      });
      toast.success("Status atualizado!");
    } catch (error) {
      toast.error("Erro ao atualizar status");
    }
  };

  const handleActivationSubmit = async () => {
    if (!assetToActivate) return;

    try {
      // Aqui é chamada a rota de ativação que define a data de início de depreciação (CPC 27)
      await updateDoc(doc(db, "assets", assetToActivate.id), {
        status: "concluido",
        availabilityDate: new Date(activationData.availabilityDate).toISOString(),
        residualValue: activationData.residualValue,
      });
      toast.success("Ativo ativado e transferido para o Imobilizado Definitivo!");
      setActivationOpen(false);
      setAssetToActivate(null);
    } catch (error) {
      toast.error("Erro ao ativar o ativo.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "assets", id));
      toast.success("Ativo deletado com sucesso!");
    } catch (error) {
      toast.error("Erro ao deletar ativo");
    }
  };

  const handleUnlinkItem = async (itemId: string) => {
    try {
      await updateExpenseMutation.mutateAsync({
        id: itemId,
        assetId: null,
      } as any);
      toast.success("Despesa desvinculada do ativo!");
      refetchExpenses(); // Invalida a query de despesas
    } catch (error) {
      toast.error("Erro ao desvincular despesa.");
    }
  };

  const handleAssetClassChange = (className: string) => {
    const selectedClass = assetClasses?.find(c => c.name === className);
    setFormData(prev => ({
      ...prev,
      assetClass: className,
      usefulLife: selectedClass ? String(selectedClass.usefulLife) : "",
      corporateUsefulLife: selectedClass ? String(selectedClass.corporateUsefulLife) : "",
      accountingAccount: selectedClass ? selectedClass.assetAccountCode || "" : "",
      depreciationAccountCode: selectedClass ? selectedClass.depreciationAccountCode || "" : "",
      amortizationAccountCode: selectedClass ? selectedClass.amortizationAccountCode || "" : "",
      resultAccountCode: selectedClass ? selectedClass.resultAccountCode || "" : "",
    }));
  };

  const getAssetExpenses = (asset: any) => {
    if (!projectExpenses) return [];
    return projectExpenses.filter((expense: any) => String(expense.assetId) === String(asset.id));
  };

  const getAssetValue = (asset: any) => {
    const items = getAssetExpenses(asset);
    return items.reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), Number(asset.value || 0));
  };

  const handleDownloadTemplate = () => {
    const headers = [
      "Número do Ativo",
      "Plaqueta",
      "Nome",
      "Descrição",
      "Valor",
      "Quantidade",
      "Data Início (AAAA-MM-DD)",
      "Centro de Custo (Código)",
      "Classe do Ativo",
      "Nome da Obra"
    ];
    const example = [
      "AT-001",
      "PAT-1001",
      "Betoneira 400L",
      "Betoneira para obra",
      "2500.00",
      "1",
      new Date().toISOString().split('T')[0],
      "CC-001",
      "Máquinas e Equipamentos",
      "Obra Residencial"
    ];
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 40 }, { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 20 }, { wch: 25 }, { wch: 25 }];
    
    XLSX.utils.book_append_sheet(wb, ws, "Template Ativos");
    XLSX.writeFile(wb, "template_importacao_ativos.xlsx");
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);

        if (json.length === 0) {
          toast.error("Arquivo vazio.");
          setIsImporting(false);
          return;
        }

        let successCount = 0;
        const promises = json.map(async (row: any) => {
             const projectName = row["Nome da Obra"];
             const project = projects.find(p => p.name?.toLowerCase() === projectName?.toLowerCase());
             const projectId = project ? project.id : (filters.projectId !== "all" ? filters.projectId : "");

             if (!projectId) return;

             const payload = {
                projectId,
                assetNumber: row["Número do Ativo"] ? String(row["Número do Ativo"]) : "",
                tagNumber: row["Plaqueta"] ? String(row["Plaqueta"]) : "",
                name: row["Nome"] || "Ativo Importado",
                description: row["Descrição"] || "",
                value: row["Valor"] ? Number(row["Valor"]) : 0,
                quantity: row["Quantidade"] ? Number(row["Quantidade"]) : 1,
                startDate: row["Data Início (AAAA-MM-DD)"] ? new Date(row["Data Início (AAAA-MM-DD)"]).toISOString() : new Date().toISOString(),
                costCenter: row["Centro de Custo (Código)"] || "",
                assetClass: row["Classe do Ativo"] || "",
                status: "planejamento",
                createdAt: new Date().toISOString()
             };

             await addDoc(collection(db, "assets"), payload);
             successCount++;
        });

        await Promise.all(promises);
        toast.success(`${successCount} ativos importados com sucesso!`);
      } catch (error) {
        console.error(error);
        toast.error("Erro ao processar arquivo.");
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const filteredAssets = assets?.filter(asset => {
    const matchesAssetNumber = !filters.assetNumber || (asset.assetNumber || "").toLowerCase().includes(filters.assetNumber.toLowerCase());
    const matchesTagNumber = !filters.tagNumber || (asset.tagNumber || "").toLowerCase().includes(filters.tagNumber.toLowerCase());
    const matchesDescription = !filters.description || (asset.description || "").toLowerCase().includes(filters.description.toLowerCase());
    const costCenterValue = typeof asset.costCenter === 'object' ? asset.costCenter?.code : asset.costCenter;
    const matchesCostCenter = !filters.costCenter || (costCenterValue || "").toLowerCase().includes(filters.costCenter.toLowerCase());
    const matchesProject = filters.projectId === "all" || String(asset.projectId) === filters.projectId;
    return matchesAssetNumber && matchesTagNumber && matchesDescription && matchesCostCenter && matchesProject;
  });

  const totalAssetsValue = filteredAssets?.reduce((acc, asset) => acc + getAssetValue(asset), 0) || 0;

  const handleExportExcel = () => {
    if (!filteredAssets || filteredAssets.length === 0) {
      toast.error("Não há ativos para exportar.");
      return;
    }

    const data = filteredAssets.map(asset => {
      const project = projects?.find(p => String(p.id) === String(asset.projectId));
      const ccCode = typeof asset.costCenter === 'object' ? (asset.costCenter as any)?.code : asset.costCenter;
      const cc = costCenters?.find((c: any) => c.code === ccCode);
      const ccDisplay = cc ? `${cc.code} - ${cc.name}` : (ccCode || "");

      return {
        "Número do Ativo": asset.assetNumber || "",
        "Plaqueta": asset.tagNumber || "",
        "Nome": asset.name || "",
        "Descrição": asset.description || "",
        "Valor Original": asset.value ? Number(asset.value) : 0,
        "Quantidade": asset.quantity ? Number(asset.quantity) : 1,
        "Data Início": asset.startDate ? new Date(asset.startDate).toLocaleDateString('pt-BR') : "",
        "Status": asset.status ? asset.status.replace('_', ' ') : "",
        "Obra": project?.name || "",
        "Centro de Custo": ccDisplay,
        "Classe do Ativo": asset.assetClass || "",
        "Vida Útil (Fiscal)": asset.usefulLife || "",
        "Vida Útil (Societária)": asset.corporateUsefulLife || "",
        "Conta Contábil": asset.accountingAccount || "",
        "Conta Depreciação": asset.depreciationAccountCode || "",
        "Conta Amortização": asset.amortizationAccountCode || "",
        "Conta Resultado": asset.resultAccountCode || "",
        "Notas": asset.notes || ""
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wscols = Object.keys(data[0]).map(key => ({ wch: Math.max(key.length, 15) }));
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ativos");
    XLSX.writeFile(wb, `ativos_em_andamento_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Relatório exportado com sucesso!");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-700">Ativos em Andamento</h1>
        
        <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportExcel}>
                <Download className="mr-2 h-4 w-4" />
                Exportar Excel
            </Button>
            <Button variant="outline" onClick={handleDownloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                Template
            </Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
                {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Importar
            </Button>
            <Input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileUpload}
                accept=".xlsx, .xls"
            />

        {/* Diálogo de Ativação (CPC 27) */}
        <Dialog open={activationOpen} onOpenChange={setActivationOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="text-green-600" />
                Ativação de Imobilizado
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="bg-yellow-50 p-3 rounded-md border border-yellow-200 text-sm text-yellow-800">
                <strong>Atenção (CPC 27):</strong> Ao ativar este ativo, a depreciação será iniciada com base na data de disponibilidade informada abaixo. Custos posteriores serão considerados despesas do período.
              </div>
              <div>
                <label className="text-sm font-medium">Data de Disponibilidade para Uso</label>
                <Input 
                  type="date" 
                  value={activationData.availabilityDate}
                  onChange={(e) => setActivationData({...activationData, availabilityDate: e.target.value})}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Valor Residual Estimado (R$)</label>
                <Input 
                  type="number" 
                  value={activationData.residualValue}
                  onChange={(e) => setActivationData({...activationData, residualValue: e.target.value})}
                />
              </div>
              <Button onClick={handleActivationSubmit} className="w-full bg-green-600 hover:bg-green-700">Confirmar Ativação</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Diálogo de Visualização de Detalhes */}
        <Dialog open={viewOpen} onOpenChange={setViewOpen}>
          <DialogContent className="w-[98vw] max-w-[98vw] h-[98vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Detalhes do Ativo</DialogTitle>
            </DialogHeader>
            {viewingAsset && (
              <div className="w-full mt-4 space-y-6">
                <div className="bg-slate-50 rounded-lg border">
                  <div 
                    className={`bg-slate-200 px-6 py-3 rounded-t-lg flex justify-between items-center cursor-pointer ${expandedSections.details ? 'border-b' : ''}`}
                    onClick={() => toggleSection('details')}
                  >
                    <h3 className="text-xl font-semibold">Detalhes Gerais</h3>
                    {expandedSections.details ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                  {expandedSections.details && (
                  (() => {
                    const totalAssetValue = getAssetValue(viewingAsset);
                    const calculateDepreciation = (life: any) => {
                      const years = Number(life || 0);
                      if (years <= 0 || !viewingAsset.startDate) return { monthly: 0, accumulated: 0, residual: totalAssetValue, monthsAccumulated: 0, totalMonths: 0 };
                      const start = new Date(viewingAsset.startDate);
                      const now = new Date();
                      let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
                      if (months < 0) months = 0;
                      const totalMonths = years * 12;
                      const monthly = totalAssetValue / totalMonths;
                      const accumulated = Math.min(months * monthly, totalAssetValue);
                      const residual = totalAssetValue - accumulated;
                      const monthsAccumulated = Math.min(months, totalMonths);
                      return { monthly, accumulated, residual, monthsAccumulated, totalMonths };
                    };
                    const fiscal = calculateDepreciation(viewingAsset.usefulLife);
                    const corporate = calculateDepreciation(viewingAsset.corporateUsefulLife);
                    return (
                  <div className="p-6 grid grid-cols-9 gap-6">
                <div className="col-span-1 space-y-1">
                  <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Número do Ativo</label>
                  <p className="text-base font-medium">{viewingAsset.assetNumber || "-"}</p>
                </div>
                <div className="col-span-1 space-y-1">
                  <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Nº de Plaqueta</label>
                  <p className="text-base font-medium">{viewingAsset.tagNumber || "-"}</p>
                </div>
                <div className="col-span-1 space-y-1">
                  <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Data Início</label>
                  <p className="text-base">
                    {viewingAsset.startDate ? new Date(viewingAsset.startDate).toLocaleDateString("pt-BR") : "-"}
                  </p>
                </div>
                <div className="col-span-1 space-y-1">
                  <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Status</label>
                  <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-blue-100 text-blue-800 capitalize">
                    {viewingAsset.status?.replace('_', ' ')}
                  </div>
                </div>
                <div className="col-span-1 space-y-1">
                  <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Classe</label>
                  <p className="text-base">{viewingAsset.assetClass || "-"}</p>
                </div>
                <div className="col-span-1 space-y-1">
                  <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Conta Contábil</label>
                  <p className="text-base">{viewingAsset.accountingAccount || "-"}</p>
                </div>
                <div className="col-span-1 space-y-1">
                  <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Vida Útil</label>
                  <p className="text-base">{viewingAsset.usefulLife ? `${viewingAsset.usefulLife} anos` : "-"}</p>
                </div>
                <div className="col-span-1 space-y-1">
                  <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Vida Societária</label>
                  <p className="text-base">{viewingAsset.corporateUsefulLife ? `${viewingAsset.corporateUsefulLife} anos` : "-"}</p>
                </div>
                <div className="col-span-1 space-y-1">
                  <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Centro de Custo</label>
                  <p className="text-base">
                    {(() => {
                      const ccCode = typeof viewingAsset.costCenter === 'object' ? viewingAsset.costCenter?.code : viewingAsset.costCenter;
                      if (!ccCode) return "-";
                      const cc = costCenters?.find((c: any) => c.code === ccCode);
                      return cc ? `${cc.code} - ${cc.name}` : ccCode;
                    })()}
                  </p>
                </div>
                <div className="col-span-7 space-y-1">
                  <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Descrição</label>
                  <p className="text-base text-gray-700">{viewingAsset.description || "-"}</p>
                </div>
                <div className="col-span-2 space-y-1 text-right">
                  <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Acumulado (Composição)</label>
                  <p className="text-base font-medium">
                    {totalAssetValue 
                      ? `R$ ${totalAssetValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` 
                      : "-"}
                  </p>
                </div>

                <div className="col-span-9 grid grid-cols-2 gap-6">
                {/* Cenário Fiscal */}
                <div className="mt-2 bg-white p-4 rounded border">
                    <h4 className="font-medium text-base text-gray-900 border-b pb-2 mb-3 flex justify-between items-center">
                        <span>Cenário Fiscal ({viewingAsset.usefulLife || 0} anos)</span>
                        <span className="text-xs text-muted-foreground font-normal">
                            {(Number(viewingAsset.usefulLife) || 0)} * 12 = {(Number(viewingAsset.usefulLife) || 0) * 12} meses | R$ {totalAssetValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / {(Number(viewingAsset.usefulLife) || 0) * 12} = R$ {fiscal.monthly.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Deprec. Mês</label>
                            <p className="text-base font-medium">R$ {fiscal.monthly.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                              Deprec. Acum. <span className="normal-case text-xs ml-1">({fiscal.monthsAccumulated}/{fiscal.totalMonths})</span>
                            </label>
                            <p className="text-base font-medium">
                              R$ {fiscal.accumulated.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </p>
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Valor Residual</label>
                            <p className="text-lg font-bold text-blue-700">R$ {fiscal.residual.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                        </div>
                    </div>
                </div>

                {/* Cenário Societário */}
                <div className="mt-2 bg-white p-4 rounded border">
                    <h4 className="font-medium text-base text-gray-900 border-b pb-2 mb-3 flex justify-between items-center">
                        <span>Cenário Societário ({viewingAsset.corporateUsefulLife || 0} anos)</span>
                        <span className="text-xs text-muted-foreground font-normal">
                            {(Number(viewingAsset.corporateUsefulLife) || 0)} * 12 = {(Number(viewingAsset.corporateUsefulLife) || 0) * 12} meses | R$ {totalAssetValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / {(Number(viewingAsset.corporateUsefulLife) || 0) * 12} = R$ {corporate.monthly.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Deprec. Mês</label>
                            <p className="text-base font-medium">R$ {corporate.monthly.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                              Deprec. Acum. <span className="normal-case text-xs ml-1">({corporate.monthsAccumulated}/{corporate.totalMonths})</span>
                            </label>
                            <p className="text-base font-medium">
                              R$ {corporate.accumulated.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </p>
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Valor Residual</label>
                            <p className="text-lg font-bold text-green-700">R$ {corporate.residual.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                        </div>
                    </div>
                </div>
                </div>

                  </div>
                    );
                  })()
                  )}
                </div>
                <div className="bg-slate-50 rounded-lg border">
                  <div 
                    className={`bg-slate-200 px-6 py-3 rounded-t-lg flex justify-between items-center cursor-pointer ${expandedSections.composition ? 'border-b' : ''}`}
                    onClick={() => toggleSection('composition')}
                  >
                    <h3 className="text-xl font-semibold">Composição (Despesas)</h3>
                    {expandedSections.composition ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                  {expandedSections.composition && (
                  <div className="p-6 space-y-4">
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-base">Descrição da Despesa</TableHead>
                            <TableHead className="text-base">Obra</TableHead>
                            <TableHead className="text-base">Conta Contábil</TableHead>
                            <TableHead className="text-base">Classificação</TableHead>
                            <TableHead className="text-right text-base">Valor</TableHead>
                            <TableHead className="text-right text-base">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {getAssetExpenses(viewingAsset).length > 0 ? (
                            getAssetExpenses(viewingAsset).map((item: any) => (
                              <TableRow key={item.id}>
                                <TableCell className="text-base">{item.description || "Sem descrição"}</TableCell>
                                <TableCell className="text-base">{projects?.find(p => String(p.id) === String(item.projectId))?.name || "-"}</TableCell>
                                <TableCell className="text-base">{item.accountingAccount || "-"}</TableCell>
                                <TableCell className="text-base">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-sm font-medium ${
                                    item.type === 'capex' ? 'bg-blue-100 text-blue-800' : 
                                    item.type === 'opex' ? 'bg-yellow-100 text-yellow-800' : 
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {item.type || "-"}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right text-base">
                                  R$ {Number(item.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => handleUnlinkItem(item.id)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-base text-muted-foreground py-6">
                                Nenhuma despesa vinculada a este ativo.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                        <tfoot className="bg-slate-50 font-medium">
                          <TableRow>
                            <TableCell colSpan={4} className="text-base">Total Acumulado</TableCell>
                            <TableCell className="text-right text-base" colSpan={2}>
                              R$ {getAssetValue(viewingAsset).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </TableCell>
                          </TableRow>
                        </tfoot>
                      </Table>
                    </div>
                  </div>
                  )}
                </div>
                <div className="bg-slate-50 rounded-lg border">
                  <div 
                    className={`bg-slate-200 px-6 py-3 rounded-t-lg flex justify-between items-center cursor-pointer ${expandedSections.calculations ? 'border-b' : ''}`}
                    onClick={() => toggleSection('calculations')}
                  >
                    <h3 className="text-xl font-semibold">Cálculos</h3>
                    {expandedSections.calculations ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                  {expandedSections.calculations && (
                  <div className="p-6">
                    {(() => {
                      const totalValue = getAssetValue(viewingAsset);
                      const fiscalLife = Number(viewingAsset.usefulLife || 0);
                      const corporateLife = Number(viewingAsset.corporateUsefulLife || 0);
                      const startDate = viewingAsset.startDate ? new Date(viewingAsset.startDate) : null;
                      const currentYear = new Date().getFullYear();
                      
                      if (!startDate || totalValue <= 0) {
                        return <p className="text-muted-foreground text-center">Dados insuficientes para cálculo de depreciação (Valor ou Data Início ausentes).</p>;
                      }

                      const calculateScenario = (years: number) => {
                        if (years <= 0) return null;

                        const monthlyDepreciation = totalValue / (years * 12);
                        let accumulatedDepreciation = 0;
                        const startYear = startDate.getFullYear();
                        const startMonth = startDate.getMonth();
                        
                        const monthsPrior = (currentYear - startYear) * 12 - startMonth;
                        
                        if (monthsPrior > 0) {
                          const effectiveMonthsPrior = Math.min(monthsPrior, years * 12);
                          accumulatedDepreciation = effectiveMonthsPrior * monthlyDepreciation;
                        }

                        return {
                          monthlyDepreciation,
                          rows: Array.from({ length: 12 }, (_, i) => {
                            const monthDate = new Date(currentYear, i, 1);
                            const monthsSinceStart = (currentYear - startYear) * 12 + (i - startMonth);
                            const isWithinUsefulLife = monthsSinceStart >= 0 && monthsSinceStart < (years * 12);

                            const monthlyVal = isWithinUsefulLife ? monthlyDepreciation : 0;
                            const initialBalance = accumulatedDepreciation;
                            
                            if (isWithinUsefulLife) {
                                accumulatedDepreciation += monthlyVal;
                            }
                            
                            if (accumulatedDepreciation > totalValue) {
                                accumulatedDepreciation = totalValue;
                            }
                            
                            return {
                              month: monthDate.toLocaleString('pt-BR', { month: 'long' }),
                              initial: initialBalance,
                              monthly: monthlyVal,
                              final: accumulatedDepreciation
                            };
                          })
                        };
                      };

                      const fiscalData = calculateScenario(fiscalLife);
                      const corporateData = calculateScenario(corporateLife);

                      const renderTable = (title: string, data: any, years: number) => {
                        if (!data) return (
                          <div className="border rounded-md p-8 text-center h-full flex flex-col items-center justify-center bg-slate-50">
                            <h4 className="font-medium mb-2 text-lg">{title}</h4>
                            <p className="text-base text-muted-foreground">Vida útil não definida.</p>
                          </div>
                        );

                        return (
                          <div className="space-y-4">
                            <div className="flex flex-col gap-1 mb-4">
                              <h4 className="font-medium text-xl">{title}</h4>
                              <div className="text-base text-muted-foreground">
                                Vida Útil: {years} anos | Deprec. Mensal: <strong>R$ {data.monthlyDepreciation.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                              </div>
                            </div>
                            <div className="rounded-md border">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-sm">Mês</TableHead>
                                    <TableHead className="text-right text-sm">Saldo Inicial</TableHead>
                                    <TableHead className="text-right text-sm">Deprec.</TableHead>
                                    <TableHead className="text-right text-sm">Saldo Final</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {data.rows.map((row: any, index: number) => (
                                    <TableRow key={index}>
                                      <TableCell className="capitalize text-sm">{row.month}</TableCell>
                                      <TableCell className="text-right text-sm">R$ {row.initial.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                      <TableCell className="text-right text-sm">R$ {row.monthly.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                      <TableCell className="text-right text-sm">R$ {row.final.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        );
                      };

                      return (
                        <div>
                           <h3 className="text-xl font-semibold mb-6">Demonstrativo de Depreciação ({currentYear})</h3>
                           <div className="grid grid-cols-2 gap-8">
                              {renderTable("Cenário Fiscal", fiscalData, fiscalLife)}
                              {renderTable("Cenário Societário", corporateData, corporateLife)}
                           </div>
                        </div>
                      );
                    })()}
                  </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        </div>
        <Sheet open={open} onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (!isOpen) {
            setFormData({ projectId: selectedProjectId || "", assetNumber: "", name: "", description: "", tagNumber: "", value: "", quantity: "1", startDate: new Date().toISOString().split("T")[0], notes: "", accountingAccount: "", assetClass: "", usefulLife: "", corporateUsefulLife: "", depreciationAccountCode: "", amortizationAccountCode: "", resultAccountCode: "", costCenter: "" });
            setEditingId(null);
          }
        }}>
          <SheetTrigger asChild>
            <Button className="gap-2">
              <Plus size={20} />
              Novo Ativo
            </Button>
          </SheetTrigger>
          <SheetContent className="min-w-[60vw] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{editingId ? "Editar Ativo" : "Registrar Novo Ativo"}</SheetTitle>
            </SheetHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pl-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Número do Ativo</label>
                  <Input
                    value={formData.assetNumber}
                    readOnly
                    className="bg-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Nº de plaqueta</label>
                  <Input
                    value={formData.tagNumber}
                    onChange={(e) => setFormData({ ...formData, tagNumber: e.target.value })}
                    placeholder="Ex: PAT-00123"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Obra</label>
                <Select value={formData.projectId} onValueChange={(v) => setFormData({ ...formData, projectId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma obra" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects?.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Nome do Ativo</label>
                <Input
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Equipamento de Escavação"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Descrição</label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descrição do ativo..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Valor (R$)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Quantidade</label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    placeholder="1"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Centro de Custo</label>
                <Select value={formData.costCenter} onValueChange={(v) => setFormData({ ...formData, costCenter: v })}>
                  <SelectTrigger>
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

              <div className="border rounded-md p-4 bg-slate-50 space-y-4">
                <h4 className="font-medium text-sm text-gray-700 border-b pb-2">Dados Contábeis</h4>
                <div className="grid grid-cols-8 gap-4">
                  <div className="col-span-2">
                    <label className="text-sm font-medium">Classe do Imobilizado</label>
                    <Select value={formData.assetClass} onValueChange={handleAssetClassChange}>
                      <SelectTrigger><SelectValue placeholder="Selecione a classe..." /></SelectTrigger>
                      <SelectContent>{assetClasses?.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1">
                    <label className="text-sm font-medium">Vida Físcal</label>
                    <Input
                      type="number"
                      value={formData.usefulLife}
                      readOnly
                      className="bg-slate-100"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="text-sm font-medium">Vida Societária</label>
                    <Input
                      type="number"
                      value={formData.corporateUsefulLife}
                      readOnly
                      className="bg-slate-100"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="text-sm font-medium">Conta Custo</label>
                      <Input
                        value={formData.accountingAccount}
                        readOnly
                        className="bg-slate-100"
                      />
                  </div>
                  <div className="col-span-1">
                    <label className="text-sm font-medium">Conta Deprec.</label>
                      <Input
                        value={formData.depreciationAccountCode}
                        readOnly
                        className="bg-slate-100"
                      />
                  </div>
                  <div className="col-span-1">
                    <label className="text-sm font-medium">Conta Amort.</label>
                      <Input
                        value={formData.amortizationAccountCode}
                        readOnly
                        className="bg-slate-100"
                      />
                  </div>
                  <div className="col-span-1">
                    <label className="text-sm font-medium">Conta Result.</label>
                      <Input
                        value={formData.resultAccountCode}
                        readOnly
                        className="bg-slate-100"
                      />
                </div>
              </div>
              </div>

              <div>
                <label className="text-sm font-medium">Data de Início</label>
                <Input
                  type="date"
                  required
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Notas</label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Observações adicionais..."
                />
              </div>
              <Button type="submit" className="w-full">
                {editingId ? "Salvar Alterações" : "Registrar Ativo"}
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      </div>

      <div className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Obra</label>
                <Select value={filters.projectId} onValueChange={(v) => setFilters(prev => ({ ...prev, projectId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas as obras" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Obras</SelectItem>
                    {projects?.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Número do Ativo</label>
                <Input 
                  placeholder="Filtrar..." 
                  value={filters.assetNumber}
                  onChange={(e) => setFilters(prev => ({ ...prev, assetNumber: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Nº Plaqueta</label>
                <Input 
                  placeholder="Filtrar..." 
                  value={filters.tagNumber}
                  onChange={(e) => setFilters(prev => ({ ...prev, tagNumber: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Descrição</label>
                <Input 
                  placeholder="Filtrar..." 
                  value={filters.description}
                  onChange={(e) => setFilters(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Centro de Custo</label>
                <Input 
                  placeholder="Filtrar..." 
                  value={filters.costCenter}
                  onChange={(e) => setFilters(prev => ({ ...prev, costCenter: e.target.value }))}
                />
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center h-96">
                <Loader2 className="animate-spin" />
              </div>
            ) : filteredAssets && filteredAssets.length > 0 ? (
              <div className="border rounded-lg overflow-hidden bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nº Ativo</TableHead>
                      <TableHead>Nº Plaqueta</TableHead>
                      <TableHead>Obra</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Classe</TableHead>
                      <TableHead className="text-right">Total Acumulado (Composição)</TableHead>
                      <TableHead>Data Início</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAssets.map((asset) => (
                      <TableRow 
                        key={asset.id} 
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => handleView(asset)}
                      >
                        <TableCell className="font-mono text-xs">{(asset as any).assetNumber || "-"}</TableCell>
                        <TableCell className="text-xs">{(asset as any).tagNumber || "-"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {projects?.find(p => String(p.id) === String((asset as any).projectId))?.name || "—"}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{asset.name}</div>
                          <div className="text-xs text-muted-foreground">{asset.description}</div>
                          {(asset as any).hasImpairment && (
                            <div className="flex items-center gap-1 text-xs text-red-600 mt-1">
                              <AlertTriangle size={12} />
                              <span>Impairment</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{(asset as any).assetClass || "-"}</TableCell>
                        <TableCell className="text-xs text-right font-medium">
                          R$ {getAssetValue(asset).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-xs">
                          {asset.startDate ? new Date(asset.startDate).toLocaleDateString("pt-BR") : "-"}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Select value={asset.status} onValueChange={(v) => handleStatusChange(asset, v)}>
                            <SelectTrigger className="w-[140px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="planejamento">Planejamento</SelectItem>
                              <SelectItem value="em_desenvolvimento">Em Desenv.</SelectItem>
                              <SelectItem value="concluido">Concluído</SelectItem>
                              <SelectItem value="parado">Parado</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); handleView(asset); }}
                            className="h-8 w-8 mr-1"
                          >
                            <Eye className="w-4 h-4 text-gray-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); handleEdit(asset); }}
                            className="h-8 w-8 mr-1"
                          >
                            <Pencil className="w-4 h-4 text-blue-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); handleDelete(asset.id); }}
                            className="h-8 w-8"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <tfoot className="bg-slate-50 font-bold">
                    <TableRow>
                      <TableCell colSpan={5} className="text-right">Total Acumulado</TableCell>
                      <TableCell className="text-xs text-right">
                        R$ {totalAssetsValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell colSpan={3}></TableCell>
                    </TableRow>
                  </tfoot>
                </Table>
              </div>
            ) : (
              <Card className="p-12 text-center mt-4">
                <p className="text-gray-500">Nenhum ativo registrado para esta obra.</p>
              </Card>
            )}
          </div>
    </div>
  );
}
