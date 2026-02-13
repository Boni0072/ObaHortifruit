import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from "firebase/firestore";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Pencil, Trash2, Download, Upload, Check } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import * as XLSX from "xlsx";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { data: costCenters } = trpc.accounting.listCostCenters.useQuery();

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "projects"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(data);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewProject, setViewProject] = useState<any | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    startDate: new Date().toISOString().split("T")[0],
    estimatedEndDate: "",
    location: "",
    costCenter: "",
    plannedCapex: "",
    plannedOpex: "",
    monthlyDistribution: Array(12).fill(""),
  });
  const [distributionType, setDistributionType] = useState<'value' | 'percentage'>('value');

  const statusColors: { [key: string]: string } = {
    aguardando_classificacao: 'bg-blue-100 text-blue-800',
    aguardando_engenharia: 'bg-yellow-100 text-yellow-800',
    aguardando_diretoria: 'bg-orange-100 text-orange-800',
    aprovado: 'bg-green-100 text-green-800',
    rejeitado: 'bg-red-100 text-red-800',
    planejamento: 'bg-gray-100 text-gray-800',
    em_andamento: 'bg-purple-100 text-purple-800',
    concluido: 'bg-teal-100 text-teal-800',
    pausado: 'bg-pink-100 text-pink-800',
  };

  const steps = [
    { id: 'aguardando_classificacao', label: 'Classificação', color: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-600', ring: 'ring-blue-200' },
    { id: 'aguardando_engenharia', label: 'Engenharia', color: 'bg-yellow-500', border: 'border-yellow-500', text: 'text-yellow-600', ring: 'ring-yellow-200' },
    { id: 'aguardando_diretoria', label: 'Diretoria', color: 'bg-orange-500', border: 'border-orange-500', text: 'text-orange-600', ring: 'ring-orange-200' },
    { id: 'aprovado', label: 'Aprovado', color: 'bg-green-500', border: 'border-green-500', text: 'text-green-600', ring: 'ring-green-200' }
  ];

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setFormData({ name: "", description: "", startDate: new Date().toISOString().split("T")[0], estimatedEndDate: "", location: "", costCenter: "", plannedCapex: "", plannedOpex: "", monthlyDistribution: Array(12).fill("") });
      setEditingId(null);
      setDistributionType('value');
    }
  };

  const handleEdit = (project: any) => {
    let formattedDate = "";
    try {
      formattedDate = project.startDate ? new Date(project.startDate).toISOString().split("T")[0] : "";
    } catch (e) {
      console.error("Invalid date:", project.startDate);
    }
    let formattedEndDate = "";
    try {
      formattedEndDate = project.estimatedEndDate ? new Date(project.estimatedEndDate).toISOString().split("T")[0] : "";
    } catch (e) {
      console.error("Invalid end date:", project.estimatedEndDate);
    }
    setFormData({
      name: project.name,
      description: project.description || "",
      startDate: formattedDate,
      estimatedEndDate: formattedEndDate,
      location: project.location || "",
      costCenter: project.costCenter || "",
      plannedCapex: project.plannedCapex !== undefined ? String(project.plannedCapex) : (project.plannedValue ? String(project.plannedValue) : ""),
      plannedOpex: project.plannedOpex !== undefined ? String(project.plannedOpex) : "",
      monthlyDistribution: project.monthlyDistribution ? project.monthlyDistribution.map(String) : Array(12).fill(""),
    });
    setEditingId(project.id);
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta obra?")) return;
    try {
      await deleteDoc(doc(db, "projects", id));
      toast.success("Obra excluída com sucesso!");
    } catch (error) {
      toast.error("Erro ao excluir obra");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const plannedValue = (Number(formData.plannedCapex) || 0) + (Number(formData.plannedOpex) || 0);
    try {
      if (editingId) {
        await updateDoc(doc(db, "projects", editingId), {
          name: formData.name,
          description: formData.description || "",
          startDate: new Date(formData.startDate).toISOString(),
          estimatedEndDate: formData.estimatedEndDate ? new Date(formData.estimatedEndDate).toISOString() : null,
          location: formData.location || "",
          costCenter: formData.costCenter || "",
          plannedCapex: formData.plannedCapex ? Number(formData.plannedCapex) : 0,
          plannedOpex: formData.plannedOpex ? Number(formData.plannedOpex) : 0,
          plannedValue: plannedValue,
          monthlyDistribution: formData.monthlyDistribution.map(v => Number(v) || 0),
        });
        toast.success("Obra atualizada com sucesso!");
      } else {
        await addDoc(collection(db, "projects"), {
          name: formData.name,
          description: formData.description || "",
          startDate: new Date(formData.startDate).toISOString(),
          estimatedEndDate: formData.estimatedEndDate ? new Date(formData.estimatedEndDate).toISOString() : null,
          location: formData.location || "",
          costCenter: formData.costCenter || "",
          plannedCapex: formData.plannedCapex ? Number(formData.plannedCapex) : 0,
          plannedOpex: formData.plannedOpex ? Number(formData.plannedOpex) : 0,
          plannedValue: plannedValue,
          monthlyDistribution: formData.monthlyDistribution.map(v => Number(v) || 0),
          status: 'aguardando_classificacao',
          createdAt: new Date().toISOString()
        });
        toast.success("Obra criada com sucesso!");
      }
      setFormData({ name: "", description: "", startDate: new Date().toISOString().split("T")[0], estimatedEndDate: "", location: "", costCenter: "", plannedCapex: "", plannedOpex: "", monthlyDistribution: Array(12).fill("") });
      setEditingId(null);
      setOpen(false);
    } catch (error) {
      toast.error(editingId ? "Erro ao atualizar obra" : "Erro ao criar obra");
    }
  };

  const handleDownloadTemplate = () => {
    const headers = ["Código", "Nome da Obra", "Descrição", "Data de Início (AAAA-MM-DD)", "Data de Previsão de Conclusão (AAAA-MM-DD)", "Localização", "Centro de Custo", "Valor Planejado"];
    const example = ["OBRA-001", "Residencial Horizonte", "Construção de torre residencial", "2024-03-01", "2025-12-31", "Curitiba, PR", "CC-OBRA-01", "5000000"];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    
    // Ajuste de largura das colunas
    ws['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 40 }, { wch: 25 }, { wch: 35 }, { wch: 20 }, { wch: 15 }, { wch: 15 }];
    
    XLSX.utils.book_append_sheet(wb, ws, "Template Obras");
    XLSX.writeFile(wb, "template_importacao_obras.xlsx");
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
          toast.error("O arquivo está vazio.");
          setIsImporting(false);
          return;
        }

        let successCount = 0;
        
        const promises = json.map(async (row: any, index: number) => {
            const name = row["Nome da Obra"];
            if (!name) return; // Pula linhas sem nome

            // Gera um código automático se não estiver na planilha
            const code = row["Código"] ? String(row["Código"]) : `OBRA-${Date.now().toString().slice(-6)}-${index + 1}`;

            const description = row["Descrição"] || "";
            let startDate = new Date().toISOString();
            
            if (row["Data de Início (AAAA-MM-DD)"]) {
                const d = new Date(row["Data de Início (AAAA-MM-DD)"]);
                if (!isNaN(d.getTime())) startDate = d.toISOString();
            }

            let estimatedEndDate = null;
            if (row["Data de Previsão de Conclusão (AAAA-MM-DD)"]) {
                const d = new Date(row["Data de Previsão de Conclusão (AAAA-MM-DD)"]);
                if (!isNaN(d.getTime())) estimatedEndDate = d.toISOString();
            }

            const location = row["Localização"] || "";
            const costCenter = row["Centro de Custo"] || "";
            const plannedValue = row["Valor Planejado"] ? Number(row["Valor Planejado"]) : 0;

            await addDoc(collection(db, "projects"), {
                code,
                name,
                description,
                startDate,
                estimatedEndDate,
                location,
                costCenter,
                plannedValue,
                status: 'aguardando_classificacao',
                createdAt: new Date().toISOString()
            });
            successCount++;
        });

        await Promise.all(promises);
        toast.success(`${successCount} obras importadas com sucesso!`);
      } catch (error) {
        console.error("Erro na importação:", error);
        toast.error("Erro ao processar o arquivo de importação.");
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const totalPlanned = (Number(formData.plannedCapex) || 0) + (Number(formData.plannedOpex) || 0);
  const totalDistributed = formData.monthlyDistribution.reduce((acc, val) => acc + (Number(val) || 0), 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-700">Obras</h1>
        <div className="flex gap-2">
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
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus size={20} />
              Nova Obra
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Obra" : "Criar Nova Obra"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nome da Obra</label>
                <Input
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Construção Prédio A"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Descrição</label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descrição da obra..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
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
                  <label className="text-sm font-medium">Previsão de Conclusão</label>
                  <Input
                    type="date"
                    value={formData.estimatedEndDate}
                    onChange={(e) => setFormData({ ...formData, estimatedEndDate: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Localização</label>
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="Ex: São Paulo, SP"
                />
              </div>
              <div>
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
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Capex (R$)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.plannedCapex}
                    onChange={(e) => setFormData({ ...formData, plannedCapex: e.target.value })}
                    placeholder="0,00"
                    disabled={editingId ? ['aprovado', 'em_andamento', 'concluido'].includes(projects.find(p => p.id === editingId)?.status) : false}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Opex (R$)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.plannedOpex}
                    onChange={(e) => setFormData({ ...formData, plannedOpex: e.target.value })}
                    placeholder="0,00"
                    disabled={editingId ? ['aprovado', 'em_andamento', 'concluido'].includes(projects.find(p => p.id === editingId)?.status) : false}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Total Planejado</label>
                  <div className="h-10 px-3 py-2 rounded-md border border-input bg-slate-100 text-sm flex items-center font-medium text-slate-700">
                    {formatCurrency(totalPlanned)}
                  </div>
                </div>
              </div>
              <div className="border rounded-md p-4 bg-slate-50">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium text-sm text-slate-700">Distribuição Mensal (R$)</h4>
                  <span className="text-xs text-slate-500">
                    Total Distribuído: {distributionType === 'value' ? formatCurrency(totalDistributed) : `${totalPlanned > 0 ? ((totalDistributed / totalPlanned) * 100).toFixed(1) : 0}%`}
                  </span>
                  <div className="w-32">
                    <Select
                      value={distributionType}
                      onValueChange={(v) => setDistributionType(v as 'value' | 'percentage')}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="value">Valor (R$)</SelectItem>
                        <SelectItem value="percentage">Percentual (%)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"].map((month, index) => (
                    <div key={index}>
                      <label className="text-[10px] font-medium text-slate-500 uppercase">{month}</label>
                      <Input
                        type="number"
                        step={distributionType === 'value' ? "0.01" : "0.1"}
                        value={
                          distributionType === 'value'
                            ? formData.monthlyDistribution[index]
                            : totalPlanned > 0
                              ? ((Number(formData.monthlyDistribution[index]) || 0) / totalPlanned * 100).toFixed(2)
                              : "0"
                        }
                        onChange={(e) => {
                          const newDist = [...formData.monthlyDistribution];
                          const inputValue = e.target.value;
                          const val = distributionType === 'value' ? inputValue : ((Number(inputValue) / 100) * totalPlanned).toFixed(2);
                          newDist[index] = val;
                          setFormData({ ...formData, monthlyDistribution: newDist });
                        }}
                        placeholder={distributionType === 'value' ? "0,00" : "0%"}
                        disabled={distributionType === 'percentage' && totalPlanned <= 0}
                        className="h-8 text-xs bg-white"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <Button type="submit" className="w-full">
                {editingId ? "Salvar Alterações" : "Criar Obra"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>

        <Dialog open={!!viewProject} onOpenChange={(open) => !open && setViewProject(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Detalhes do Projeto</DialogTitle>
            </DialogHeader>
            {viewProject && (
              <div className="space-y-4">
                <div className="py-4 mb-36">
                  <h4 className="text-sm font-semibold text-slate-700 mb-6">Fluxo de Aprovação</h4>
                  <div className="relative flex items-center justify-between px-4">
                    <div className="absolute left-0 top-4 transform -translate-y-1/2 w-full h-1 bg-slate-100 -z-10 rounded-full" />
                    <div 
                      className={`absolute left-0 top-4 transform -translate-y-1/2 h-1 -z-10 transition-all duration-500 rounded-full ${
                        steps.findIndex(s => s.id === viewProject.status) >= 0 ? steps[steps.findIndex(s => s.id === viewProject.status)].color : 'bg-blue-600'
                      }`} 
                      style={{ width: `${(Math.max(0, steps.findIndex(s => s.id === viewProject.status)) / (steps.length - 1)) * 100}%` }} 
                    />
                    {steps.map((step, index) => {
                      const currentStepIndex = steps.findIndex(s => s.id === viewProject.status);
                      const isCompletedStep = index <= currentStepIndex;
                      const isCurrent = index === currentStepIndex;
                      
                      const approvalInfo = viewProject.approvalHistory?.slice().reverse().find((h: any) => h.status === step.id);

                      return (
                        <div key={step.id} className="flex flex-col items-center group relative">
                          <div 
                            className={`
                              w-8 h-8 rounded-full border-2 z-10 transition-all duration-300 flex items-center justify-center
                              ${isCompletedStep 
                                ? `${step.color} ${step.border} shadow-md text-white scale-110` 
                                : 'bg-white border-slate-300 text-slate-400'
                              }
                            `}
                          >
                            {isCompletedStep ? <Check className="w-5 h-5" /> : <span className="text-xs font-semibold">{index + 1}</span>}
                          </div>
                          <span className={`absolute -bottom-10 text-base font-medium whitespace-nowrap ${isCurrent ? step.text : 'text-slate-500'}`}>
                            {step.label}
                          </span>
                          {approvalInfo && (
                        <div className="absolute top-24 flex flex-col items-center w-40 text-center z-20">
                              <span className="text-sm font-bold text-slate-700 leading-tight">{approvalInfo.user}</span>
                              <span className="text-xs text-slate-500 leading-tight">{new Date(approvalInfo.date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="border-b border-slate-200 my-6" />

                <div>
                  <h4 className="font-semibold text-sm text-gray-500">Descrição</h4>
                  <p className="text-slate-700">{viewProject.description || "Sem descrição"}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold text-sm text-gray-500">Centro de Custo</h4>
                    <p className="text-slate-700">{viewProject.costCenter || "-"}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-500">Data de Início</h4>
                    <p className="text-slate-700">{new Date(viewProject.startDate).toLocaleDateString("pt-BR")}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <h4 className="font-semibold text-sm text-gray-500">Capex</h4>
                    <p className="text-slate-700 font-mono">{formatCurrency(Number(viewProject.plannedCapex || 0))}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-500">Opex</h4>
                    <p className="text-slate-700 font-mono">{formatCurrency(Number(viewProject.plannedOpex || 0))}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-500">Valor Planejado</h4>
                    <p className="text-slate-700 font-mono">{formatCurrency(Number(viewProject.plannedValue || 0))}</p>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Projects Grid */}
      <div className="border rounded-lg overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Localização</TableHead>
              <TableHead>Data Início</TableHead>
              <TableHead>Conclusão</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
        {projects && projects.length > 0 ? (
          projects.map((project) => (
            <TableRow key={project.id}>
              <TableCell className="font-mono text-xs">{(project as any).code || "-"}</TableCell>
              <TableCell className="font-medium">
                <span 
                  className="cursor-pointer hover:text-blue-600 hover:underline"
                  onClick={() => setViewProject(project)}
                >
                  {project.name}
                </span>
              </TableCell>
              <TableCell className="max-w-[200px] truncate" title={project.description || ""}>{project.description || "-"}</TableCell>
              <TableCell>{project.location || "-"}</TableCell>
              <TableCell>{new Date(project.startDate).toLocaleDateString("pt-BR")}</TableCell>
              <TableCell>{project.estimatedEndDate ? new Date(project.estimatedEndDate).toLocaleDateString("pt-BR") : "-"}</TableCell>
              <TableCell>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium w-fit ${statusColors[project.status]}`}>
                    {project.status.replace('_', ' ')}
                  </span>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(project)} className="h-8 w-8 text-blue-600">
                    <Pencil size={18} />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(project.id)} className="h-8 w-8 text-red-600">
                    <Trash2 size={18} />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={8} className="h-24 text-center text-gray-500">
              Nenhuma obra cadastrada. Crie uma nova obra para começar!
            </TableCell>
          </TableRow>
        )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
