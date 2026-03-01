import { useState, useEffect } from "react";
import { db, storage } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Pencil, Plus, Trash2, AlertTriangle, FileText, X } from "lucide-react";
import { toast } from "sonner";

export default function ExpensesPage() {
  const [projects, setProjects] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "projects"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(data);
    });
    return () => unsubscribe();
  }, []);

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const { data: expenses, isLoading, refetch } = trpc.expenses.listByProject.useQuery(
    { projectId: selectedProjectId || "" },
    { enabled: !!selectedProjectId }
  );

  const selectedProject = projects?.find(p => String(p.id) === String(selectedProjectId));
  // Bloqueia despesas se o projeto já foi aprovado pela diretoria (status 'aprovado', 'em_andamento', 'concluido')
  const isBlocked = selectedProject?.status === 'aprovado' || selectedProject?.status === 'em_andamento' || selectedProject?.status === 'concluido';

  const { data: assets } = trpc.assets.list.useQuery(
    { projectId: selectedProjectId || undefined },
    { enabled: !!selectedProjectId }
  );

  const createMutation = trpc.expenses.create.useMutation();
  const updateMutation = trpc.expenses.update.useMutation();
  const deleteMutation = trpc.expenses.delete.useMutation();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nfeKey, setNfeKey] = useState("");
  const [formData, setFormData] = useState({
    description: "",
    amount: "",
    quantity: "1",
    type: "capex" as "capex" | "opex",
    category: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
    assetId: null as string | null,
    attachment: null as File | null,
    invoiceNumber: "",
    ncm: "",
    cfop: "",
    unit: "",
  });
  const [nfeProducts, setNfeProducts] = useState<any[]>([]);

  // const fetchNfeMutation = trpc.expenses.fetchNfeData.useMutation(); // Removido para simulação

  const resetForm = () => {
    setFormData({
      description: "",
      amount: "",
      quantity: "1",
      type: "capex",
      category: "",
      date: new Date().toISOString().split("T")[0],
      notes: "",
      assetId: null,
      attachment: null,
      invoiceNumber: "",
      ncm: "",
      cfop: "",
      unit: "",
    });
    setNfeProducts([]);
    setEditingId(null);
    setNfeKey("");
  };

  const nfeMutation = trpc.nfe.consultar.useMutation({
    onSuccess: (data) => {
      toast.success("Dados da NF-e importados com sucesso!", {
        id: "fetch-nfe",
        description: "Dados extraídos do portal da NF-e.",
      });

      let formDescription = data.description;
      let formAmount = data.amount ? String(data.amount) : formData.amount;
      let formQuantity = "1";
      let formNotes = `NF-e: ${nfeKey}. ${data.notes || ''}`.trim();
      let formNcm = "";
      let formCfop = "";
      let formUnit = "";

      setNfeProducts(data.products || []);

      if (data.products && data.products.length > 0) {
          if (data.products.length === 1) {
              const p = data.products[0];
              formDescription = p.description;
              formAmount = String(p.totalPrice);
              formQuantity = String(p.quantity);
              formNcm = p.ncm || "";
              formCfop = p.cfop || "";
              formUnit = p.unit || "";
              formNotes += `\n\nDetalhes do Item:\nCód: ${p.code}\nNCM: ${p.ncm}\nCFOP: ${p.cfop}\nUnidade: ${p.unit}`;
          } else {
              formDescription = `NF-e ${nfeKey} - ${data.products.length} itens`;
              formNotes += "\n\nItens da Nota:\n" + data.products.map((p: any) => `- ${p.description} (${p.quantity} ${p.unit}) R$ ${p.totalPrice.toFixed(2)} | NCM: ${p.ncm} | CFOP: ${p.cfop}`).join("\n");
          }
      }

      let attachmentFile = null;
      if (data.pdfBase64) {
          try {
              const byteCharacters = atob(data.pdfBase64);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                  byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const blob = new Blob([byteArray], { type: "application/pdf" });
              attachmentFile = new File([blob], `NFe-${nfeKey}.pdf`, { type: "application/pdf" });
              toast.success("PDF da Nota Fiscal baixado e anexado automaticamente!");
          } catch (e) {
              console.error("Erro ao converter PDF", e);
          }
      }

      // Tenta extrair o número da nota da chave de acesso (posições 26-34)
      let extractedInvoiceNumber = "";
      if (nfeKey && nfeKey.length === 44) {
        extractedInvoiceNumber = parseInt(nfeKey.substring(25, 34)).toString();
      }

      setFormData(prev => ({
        ...prev,
        description: formDescription || prev.description,
        amount: formAmount,
        quantity: formQuantity,
        date: data.date && !isNaN(new Date(data.date).getTime()) ? new Date(data.date).toISOString().split("T")[0] : prev.date,
        notes: formNotes,
        attachment: attachmentFile || prev.attachment,
        invoiceNumber: extractedInvoiceNumber || prev.invoiceNumber,
        ncm: formNcm || prev.ncm,
        cfop: formCfop || prev.cfop,
        unit: formUnit || prev.unit
      }));
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido.";
      toast.error("Falha ao buscar dados da NF-e.", { id: "fetch-nfe", description: errorMessage });
    },
    onMutate: () => {
      toast.info("Buscando dados da NF-e... O navegador pode abrir para resolver o Captcha.", { id: "fetch-nfe", duration: 10000 });
    }
  });

  const handleFetchNfe = async () => {
    if (!nfeKey || nfeKey.length !== 44) {
      toast.error("Por favor, insira uma chave de acesso válida com 44 dígitos.");
      return;
    }
    nfeMutation.mutate({ chave: nfeKey });
  };

  const handleAttachmentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFormData(prev => ({ ...prev, attachment: file }));

    // Se for XML, processa os dados
    if (file.name.toLowerCase().endsWith('.xml')) {
      try {
        const text = await file.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");

        const get = (tag: string, parent: Element | Document = xmlDoc) => {
          const el = parent.getElementsByTagName(tag)[0];
          return el ? el.textContent?.trim() || "" : "";
        };

        const emitente = get("xNome", xmlDoc.getElementsByTagName("emit")[0]);
        const nNF = get("nNF");
        const dhEmi = get("dhEmi") || get("dEmi");
        const vNF = get("vNF");
        const infCpl = get("infCpl");

        const products: any[] = [];
        const dets = xmlDoc.getElementsByTagName("det");
        
        for (let i = 0; i < dets.length; i++) {
            const prod = dets[i].getElementsByTagName("prod")[0];
            const imposto = dets[i].getElementsByTagName("imposto")[0];
            if (prod) {
                products.push({
                    code: get("cProd", prod),
                    description: get("xProd", prod),
                    ncm: get("NCM", prod),
                    cest: get("CEST", prod),
                    cfop: get("CFOP", prod),
                    unit: get("uCom", prod),
                    quantity: parseFloat(get("qCom", prod) || "0"),
                    unitPrice: parseFloat(get("vUnCom", prod) || "0"),
                    totalPrice: parseFloat(get("vProd", prod) || "0"),
                    cst: imposto ? (get("CST", imposto) || get("CSOSN", imposto)) : "",
                    orig: imposto ? get("orig", imposto) : ""
                });
            }
        }

        setNfeProducts(products);
        
        setFormData(prev => ({
            ...prev,
            description: emitente || prev.description,
            amount: vNF || prev.amount,
            date: dhEmi ? new Date(dhEmi).toISOString().split("T")[0] : prev.date,
            invoiceNumber: nNF || prev.invoiceNumber,
            notes: `${prev.notes} ${infCpl}`.trim(),
            ncm: products[0]?.ncm || prev.ncm,
            cfop: products[0]?.cfop || prev.cfop,
            unit: products[0]?.unit || prev.unit,
        }));

        toast.success("Dados extraídos do XML com sucesso!");
      } catch (error) {
        console.error("Erro ao processar XML", error);
        toast.error("Falha ao processar o arquivo XML.");
      }
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) resetForm();
  };

  const handleEdit = (expense: any) => {
    setFormData({
      description: expense.description,
      amount: expense.amount,
      quantity: expense.quantity ? String(expense.quantity) : "1",
      type: expense.type,
      category: expense.category || "",
      date: expense.date ? new Date(expense.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
      notes: expense.notes || "",
      assetId: expense.assetId ? String(expense.assetId) : null,
      attachment: null, // Reset attachment on edit for now
      invoiceNumber: expense.invoiceNumber || "",
      ncm: expense.ncm || "",
      cfop: expense.cfop || "",
      unit: expense.unit || "",
    });
    setEditingId(expense.id);
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) {
      toast.error("Selecione uma obra");
      return;
    }

    if (isBlocked && !editingId) {
      toast.error("Este projeto já foi aprovado e as despesas estão bloqueadas.");
      return;
    }

    let attachmentUrl = null;
    if (formData.attachment) {
      try {
        const fileName = `${Date.now()}_${formData.attachment.name}`;
        const storageRef = ref(storage, `expenses/${fileName}`);
        const snapshot = await uploadBytes(storageRef, formData.attachment);
        attachmentUrl = await getDownloadURL(snapshot.ref);
      } catch (error) {
        console.error("Erro ao fazer upload do arquivo:", error);
        toast.error("Erro ao salvar o anexo. Tente novamente.");
        return;
      }
    }

    const submissionData = {
      projectId: selectedProjectId,
      description: formData.description,
      amount: formData.amount,
      quantity: Number(formData.quantity) || 1,
      type: formData.type,
      category: formData.category || "",
      date: new Date(formData.date),
      notes: formData.notes || "",
      assetId: formData.type === 'capex' ? formData.assetId : null,
      invoiceNumber: formData.invoiceNumber,
      attachmentUrl: attachmentUrl,
      ncm: formData.ncm,
      cfop: formData.cfop,
      unit: formData.unit,
    };

    console.log({ assetIdType: typeof submissionData.assetId, assetIdValue: submissionData.assetId });

    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          ...submissionData,
        });
        toast.success("Despesa atualizada com sucesso!");
      } else {
        await createMutation.mutateAsync(submissionData);
        toast.success("Despesa criada com sucesso!");
      }
      setOpen(false);
      resetForm();
      refetch();
    } catch (error: any) {
      toast.error(error.message || (editingId ? "Erro ao atualizar despesa" : "Erro ao criar despesa"));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta despesa?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Despesa deletada com sucesso!");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao deletar despesa");
    }
  };

  const totalCapex = expenses?.filter(e => e.type === 'capex').reduce((sum, e) => sum + Number(e.amount), 0) || 0;
  const totalOpex = expenses?.filter(e => e.type === 'opex').reduce((sum, e) => sum + Number(e.amount), 0) || 0;
  const totalGeneral = totalCapex + totalOpex;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-700">Despesas</h1>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus size={20} />
              Nova Despesa
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] flex flex-col max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Despesa" : "Registrar Nova Despesa"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="overflow-y-auto p-4 -mx-4 space-y-4 flex-1"> {/* Added scrollable div */}
              <div className="space-y-2 p-4 border rounded-lg bg-slate-50">
                <label className="text-sm font-medium">Importar da NF-e (Opcional)</label>
                <div className="flex gap-2">
                  <Input
                    value={nfeKey}
                    onChange={(e) => setNfeKey(e.target.value.replace(/\D/g, ''))}
                    placeholder="Digite os 44 dígitos da chave de acesso"
                    maxLength={44}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleFetchNfe}
                    disabled={nfeMutation.isPending}
                  >
                    {nfeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground pt-2">
                  Nota: Se os dados retornados não forem reais, o sistema pode estar em modo de teste (homologação). A consulta a dados reais deve ser configurada no servidor.
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Obra</label>
                <Select value={selectedProjectId || ""} onValueChange={(v) => setSelectedProjectId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma obra" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects?.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        {p.name} {(p.status === 'aprovado' || p.status === 'em_andamento' || p.status === 'concluido') ? '(Bloqueado)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedProjectId && isBlocked && !editingId && (
                <div className="flex items-center gap-2 p-3 text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-md">
                  <AlertTriangle size={16} />
                  <span>Projeto aprovado/concluído. Despesas bloqueadas.</span>
                </div>
              )}

              <div>
                <label className="text-sm font-medium">Descrição</label>
                <Input
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ex: Compra de cimento"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Valor (R$)</label>
                  <Input
                    required
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
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

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">NCM</label>
                  <Input
                    value={formData.ncm}
                    onChange={(e) => setFormData({ ...formData, ncm: e.target.value })}
                    placeholder="0000.00.00"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">CFOP</label>
                  <Input
                    value={formData.cfop}
                    onChange={(e) => setFormData({ ...formData, cfop: e.target.value })}
                    placeholder="0000"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Unidade</label>
                  <Input
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    placeholder="UN"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Tipo</label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v as "capex" | "opex" })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="capex">Capex (Capital)</SelectItem>
                    <SelectItem value="opex">Opex (Operacional)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.type === "capex" && (
                <div>
                  <label className="text-sm font-medium">Vincular ao Ativo</label>
                  <Select 
                    value={formData.assetId === null ? "none" : String(formData.assetId)} 
                    onValueChange={(v) => setFormData({ ...formData, assetId: v === "none" ? null : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um ativo (Opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {assets?.map((asset) => (
                        <SelectItem key={asset.id} value={String(asset.id)}>
                          {asset.tagNumber ? `${asset.tagNumber} - ${asset.name}` : asset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <label className="text-sm font-medium">Categoria</label>
                <Input
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="Ex: Materiais"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Data</label>
                <Input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Notas</label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Observações adicionais..."
                  className="min-h-[120px]"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Número da Nota Fiscal</label>
                  <Input
                    value={formData.invoiceNumber}
                    onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                    placeholder="Ex: 123456"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Arquivo (PDF/Imagem/XML)</label>
                  <Input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.xml"
                    onChange={handleAttachmentChange}
                    className="cursor-pointer"
                  />
                </div>
              </div>

              {formData.attachment && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-md flex items-center justify-between">
                    <div className="flex items-center gap-2 text-green-800 overflow-hidden">
                        <FileText size={18} className="shrink-0" />
                        <span className="text-sm font-medium truncate">{formData.attachment.name}</span>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-green-700 hover:text-red-600 hover:bg-green-100" onClick={() => setFormData({...formData, attachment: null})}>
                        <X size={14} />
                    </Button>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium">Dados dos Produtos / Serviços</label>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddProductRow} className="h-6 text-xs"><Plus size={12} className="mr-1"/> Adicionar Item</Button>
                </div>
                <div className="border rounded-md overflow-x-auto bg-white">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 font-medium text-slate-600 border-b">
                      <tr>
                        <th className="px-2 py-1 whitespace-nowrap">CÓDIGO PRODUTO</th>
                        <th className="px-2 py-1">DESCRIÇÃO DO PRODUTO / SERVIÇO</th>
                        <th className="px-2 py-1 whitespace-nowrap">NCM/SH</th>
                        <th className="px-2 py-1 whitespace-nowrap">O/CST</th>
                        <th className="px-2 py-1 whitespace-nowrap">CFOP</th>
                        <th className="px-2 py-1 whitespace-nowrap">UN</th>
                        <th className="px-2 py-1 text-right whitespace-nowrap">QUANT</th>
                        <th className="px-2 py-1 text-right whitespace-nowrap">VALOR UNIT</th>
                        <th className="px-2 py-1 text-right whitespace-nowrap">VALOR TOTAL</th>
                        <th className="px-2 py-1 w-[30px]"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {nfeProducts.length > 0 ? (
                        nfeProducts.map((prod, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-1"><Input className="h-6 text-xs px-1 font-mono" value={prod.code} onChange={(e) => handleProductChange(idx, 'code', e.target.value)} /></td>
                            <td className="p-1"><Input className="h-6 text-xs px-1" value={prod.description} onChange={(e) => handleProductChange(idx, 'description', e.target.value)} /></td>
                            <td className="p-1"><Input className="h-6 text-xs px-1 w-20" value={prod.ncm} onChange={(e) => handleProductChange(idx, 'ncm', e.target.value)} /></td>
                            <td className="p-1"><Input className="h-6 text-xs px-1 w-16" value={prod.cst} onChange={(e) => handleProductChange(idx, 'cst', e.target.value)} /></td>
                            <td className="p-1"><Input className="h-6 text-xs px-1 w-16" value={prod.cfop} onChange={(e) => handleProductChange(idx, 'cfop', e.target.value)} /></td>
                            <td className="p-1"><Input className="h-6 text-xs px-1 w-12" value={prod.unit} onChange={(e) => handleProductChange(idx, 'unit', e.target.value)} /></td>
                            <td className="p-1"><Input className="h-6 text-xs px-1 w-16 text-right" type="number" value={prod.quantity} onChange={(e) => handleProductChange(idx, 'quantity', e.target.value)} /></td>
                            <td className="p-1"><Input className="h-6 text-xs px-1 w-20 text-right" type="number" value={prod.unitPrice} onChange={(e) => handleProductChange(idx, 'unitPrice', e.target.value)} /></td>
                            <td className="p-1 text-right font-medium text-xs px-2">{Number(prod.totalPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            <td className="p-1 text-center"><Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={() => handleRemoveProductRow(idx)}><X size={12} /></Button></td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={10} className="px-2 py-4 text-center text-slate-400 italic">Nenhum item importado. Utilize a busca por chave de acesso ou anexe um arquivo XML.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <DialogFooter className="pt-4">
              <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending || (isBlocked && !editingId)}>
                {createMutation.isPending || updateMutation.isPending ? "Salvando..." : (editingId ? "Atualizar Despesa" : "Registrar Despesa")}
              </Button>
            </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Project Selection */}
      <Card className="p-6">
        <label className="text-sm font-medium">Selecione uma Obra</label>
        <Select value={selectedProjectId || ""} onValueChange={(v) => setSelectedProjectId(v)}>
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
      </Card>

      {/* Summary */}
      {selectedProjectId && (
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="p-6">
            <p className="text-gray-500 text-sm mb-2">Total Capex</p>
            <p className="text-3xl font-bold text-blue-600">R$ {totalCapex.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </Card>
          <Card className="p-6">
            <p className="text-gray-500 text-sm mb-2">Total Opex</p>
            <p className="text-3xl font-bold text-green-600">R$ {totalOpex.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </Card>
        </div>
      )}

      {/* Expenses List */}
      {selectedProjectId && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-96">
              <Loader2 className="animate-spin" />
            </div>
          ) : expenses && expenses.length > 0 ? (
            <div className="rounded-md border bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-center">Qtd</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Conta Contábil</TableHead>
                    <TableHead>Nota Fiscal</TableHead>
                    <TableHead>Notas</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell className="font-medium">{expense.description}</TableCell>
                      <TableCell>{expense.category || "—"}</TableCell>
                      <TableCell>{new Date(expense.date).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell className="text-center">{(expense as any).quantity || 1}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          expense.type === 'capex' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                        }`}>
                          {expense.type.toUpperCase()}
                        </span>
                      </TableCell>
                      <TableCell>{(expense as any).accountingAccount || "—"}</TableCell>
                      <TableCell>
                        {(expense as any).invoiceNumber ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1 text-slate-600" title={`NF: ${(expense as any).invoiceNumber}`}>
                              <FileText size={14} />
                              <span className="text-xs font-medium">{(expense as any).invoiceNumber}</span>
                            </div>
                            {(expense as any).attachmentUrl && (
                              <a href={(expense as any).attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5">
                                <FileText size={10} /> Ver PDF
                              </a>
                            )}
                          </div>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={expense.notes || ""}>
                        {expense.notes || "—"}
                      </TableCell>
                      <TableCell className="text-right font-bold">R$ {Number(expense.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                        onClick={() => handleEdit(expense)}
                      >
                            <Pencil size={16} className="text-blue-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                        onClick={() => handleDelete(expense.id)}
                        disabled={deleteMutation.isPending}
                      >
                            <Trash2 size={16} className="text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <tfoot className="bg-slate-50 font-bold">
                  <TableRow>
                    <TableCell colSpan={6} className="text-right">Total Acumulado</TableCell>
                    <TableCell className="text-right">
                      R$ {totalGeneral.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </tfoot>
              </Table>
            </div>
          ) : (
            <Card className="p-12 text-center">
              <p className="text-gray-500">Nenhuma despesa registrada para esta obra.</p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
