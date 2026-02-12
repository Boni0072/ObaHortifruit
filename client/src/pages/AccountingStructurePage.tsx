import { useState, useRef, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, addDoc, writeBatch } from "firebase/firestore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus, Loader2, Download, Upload, ChevronDown, ChevronUp, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Badge } from "@/components/ui/badge";

interface AssetClass {
  id: string;
  code: string;
  name: string;
  usefulLife: number;
  corporateUsefulLife: number;
  assetAccountCode?: string;
  assetAccountDescription?: string;
  depreciationAccountCode?: string;
  depreciationAccountDescription?: string;
  amortizationAccountCode?: string;
  amortizationAccountDescription?: string;
  resultAccountCode?: string;
  resultAccountDescription?: string;
}

interface CostCenter {
  id: string;
  code: string;
  name: string;
  department: string;
}

interface AccountingAccount {
  id: string;
  code: string;
  name: string;
  type?: string;
}

export default function AccountingStructurePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-slate-700">Estrutura Contábil</h1>
      <Tabs defaultValue="chart-of-accounts" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="chart-of-accounts">Plano de Contas</TabsTrigger>
          <TabsTrigger value="asset-classes">Classes do Imobilizado</TabsTrigger>
          <TabsTrigger value="cost-centers">Centros de Custo</TabsTrigger>
        </TabsList>
        
        <TabsContent value="chart-of-accounts">
          <ChartOfAccountsTab />
        </TabsContent>
        <TabsContent value="asset-classes">
          <AssetClassesTab />
        </TabsContent>
        <TabsContent value="cost-centers">
          <CostCentersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ChartOfAccountsTab() {
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "accounting_accounts"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AccountingAccount));
      setAccounts(data);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const [form, setForm] = useState({ code: "", name: "", type: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [nameFilter, setNameFilter] = useState("");

  const handleEdit = (acc: AccountingAccount) => {
    setForm({ code: acc.code, name: acc.name, type: acc.type || "" });
    setEditingId(acc.id);
    setIsExpanded(true);
  };

  const cancelEdit = () => {
    setForm({ code: "", name: "", type: "" });
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateDoc(doc(db, "accounting_accounts", editingId), {
          code: form.code,
          name: form.name,
          type: form.type || null,
        });
        toast.success("Conta atualizada!");
      } else {
        await setDoc(doc(db, "accounting_accounts", form.code), {
          code: form.code,
          name: form.name,
          type: form.type || null,
          createdAt: new Date().toISOString()
        });
        toast.success("Conta criada!");
      }
      cancelEdit();
    } catch (error) {
      toast.error(editingId ? "Erro ao atualizar conta" : "Erro ao criar conta");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir conta?")) return;
    await deleteDoc(doc(db, "accounting_accounts", id));
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

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
          return;
        }

        const mappedData = json.map((row: any) => ({
          code: String(row["Código"] || "").trim(),
          name: String(row["Nome"] || "").trim(),
          type: row["Tipo"] ? String(row["Tipo"]).trim() : undefined,
        })).filter(item => item.code && item.name);

        if (mappedData.length === 0) {
          toast.error("Nenhum dado válido encontrado. Verifique as colunas 'Código' e 'Nome'.");
          return;
        }

        const batch = writeBatch(db);
        mappedData.forEach((item: any) => {
            const docRef = doc(db, "accounting_accounts", item.code);
            batch.set(docRef, { ...item, createdAt: new Date().toISOString() }, { merge: true });
        });
        await batch.commit();

        toast.success(`Importação concluída! ${mappedData.length} contas foram processadas.`);
      } catch (error) {
        console.error(error);
        toast.error("Erro ao processar arquivo.");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownloadTemplate = () => {
    const headers = ["Código", "Nome", "Tipo"];
    const example = ["1.1.01", "Caixa Geral", "Ativo"];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws['!cols'] = [{ wch: 15 }, { wch: 40 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "template_plano_contas.xlsx");
  };

  const filteredAccounts = accounts?.filter(acc => {
    const nameMatch = !nameFilter || acc.name.toLowerCase().includes(nameFilter.toLowerCase());
    if (!nameMatch) return false;

    if (typeFilter === "all") return true;
    if (typeFilter === "undefined") return !acc.type;
    return acc.type === typeFilter;
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <div>
            <CardTitle className="text-xl">Plano de Contas</CardTitle>
            <CardDescription className="text-base">Cadastro de contas contábeis para classificação de despesas.</CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => { cancelEdit(); setIsExpanded(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Conta
          </Button>
          <Button variant="outline" onClick={handleDownloadTemplate}>
            <Download className="w-4 h-4 mr-2" />
            Template
          </Button>
          <Button onClick={() => fileInputRef.current?.click()} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Importar
          </Button>
          <Input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileUpload}
            accept=".xlsx, .xls"
          />
        </div>
      </CardHeader>
      {isExpanded && (
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="flex gap-4 items-end bg-green-50 p-4 rounded-md border border-green-100">
          <div className="w-[20%]">
            <label className="text-base font-medium">Código</label>
            <Input value={form.code} onChange={e => setForm({...form, code: e.target.value})} placeholder="Ex: 1.1.01" required />
          </div>
          <div className="flex-1">
            <label className="text-base font-medium">Nome da Conta</label>
            <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Ex: Caixa Geral" required />
          </div>
          <div className="w-[20%]">
            <label className="text-base font-medium">Tipo</label>
            <Select value={form.type} onValueChange={(v) => setForm({...form, type: v})}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Ativo">Ativo</SelectItem>
                <SelectItem value="Passivo">Passivo</SelectItem>
                <SelectItem value="Depreciação">Depreciação</SelectItem>
                <SelectItem value="Amortização">Amortização</SelectItem>
                <SelectItem value="Resultado">Resultado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            {editingId && (
              <Button type="button" variant="outline" onClick={cancelEdit}>
                <X className="w-4 h-4 mr-2" /> Cancelar
              </Button>
            )}
            <Button type="submit">
              {editingId ? <Pencil className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              {editingId ? "Salvar" : "Adicionar"}
            </Button>
          </div>
        </form>
      </CardContent>
      )}
      <CardContent>
        <div className="flex gap-4 mb-4">
          <div className="w-64">
            <label className="text-base font-medium mb-1 block">Filtrar por Nome</label>
            <Input
              placeholder="Filtrar por nome..."
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
            />
          </div>
          <div className="w-64">
            <label className="text-base font-medium mb-1 block">Filtrar por Tipo</label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="undefined">(não definido)</SelectItem>
                <SelectItem value="Ativo">Ativo</SelectItem>
                <SelectItem value="Passivo">Passivo</SelectItem>
                <SelectItem value="Depreciação">Depreciação</SelectItem>
                <SelectItem value="Amortização">Amortização</SelectItem>
                <SelectItem value="Resultado">Resultado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? <Loader2 className="animate-spin" /> : (
          <Table className="text-base">
            <TableHeader>
              <TableRow>
                <TableHead className="text-base">Código</TableHead>
                <TableHead className="text-base">Nome</TableHead>
                <TableHead className="text-base">Tipo</TableHead>
                <TableHead className="text-right text-base">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAccounts?.map((acc: AccountingAccount) => (
                <TableRow key={acc.id}>
                  <TableCell className="font-mono text-base">{acc.code}</TableCell>
                  <TableCell>{acc.name}</TableCell>
                  <TableCell>
                    {acc.type ? (
                      <Badge variant="secondary" className="font-normal text-sm">{acc.type}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm italic">(não definido)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(acc)}>
                      <Pencil className="w-4 h-4 text-blue-500" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(acc.id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function AssetClassesTab() {
  const [classes, setClasses] = useState<AssetClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "asset_classes"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AssetClass));
      setClasses(data);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const [form, setForm] = useState({ code: "", name: "", usefulLife: "", corporateUsefulLife: "", assetAccountCode: "", assetAccountDescription: "", depreciationAccountCode: "", depreciationAccountDescription: "", amortizationAccountCode: "", amortizationAccountDescription: "", resultAccountCode: "", resultAccountDescription: "" });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      const validTypes = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"];
      if (!validTypes.includes(file.type)) {
        toast.error("Formato de arquivo inválido.", {
          description: "Por favor, selecione um arquivo .xlsx ou .xls.",
        });
        return;
      }
      setSelectedFile(file);
      setIsExpanded(true);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) {
      toast.error("Selecione um arquivo para importar.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      let mappedData;
      try {
        const data = e.target?.result;
        if (!data) throw new Error("Não foi possível ler o arquivo.");

        // 1. Leitura e Parse do Arquivo
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: undefined });

        if (json.length === 0) {
          toast.error("Arquivo vazio.", { description: "A planilha importada não contém dados." });
          return;
        }

        // 2. Validação de Cabeçalhos
        const expectedHeaders = ["Código da Classe", "Nome da Classe", "Vida Útil (Anos)"];
        const actualHeaders = Object.keys(json[0] as object);
        const missingHeaders = expectedHeaders.filter(h => !actualHeaders.includes(h));

        if (missingHeaders.length > 0) {
          toast.error("Cabeçalhos ausentes.", { description: `A planilha deve conter as colunas: ${missingHeaders.join(", ")}.` });
          return;
        }

        // 3. Mapeamento e Validação de Dados
        mappedData = json.map((row: any, index: number) => {
          const usefulLife = Number(row["Vida Útil (Anos)"]);
          return {
            rowNum: index + 2,
            data: {
              code: String(row["Código da Classe"] || "").trim(),
              name: String(row["Nome da Classe"] || "").trim(),
              usefulLife: usefulLife,
              corporateUsefulLife: Number(row["Vida Societária (Anos)"] || usefulLife || 0),
              assetAccountCode: String(row["Conta Contábil (Custo)"] || "").trim(),
              assetAccountDescription: String(row["Descrição Conta Custo"] || "").trim(),
              depreciationAccountCode: String(row["Conta Contábil (Depreciação)"] || "").trim(),
              depreciationAccountDescription: String(row["Descrição Conta Depreciação"] || "").trim(),
              amortizationAccountCode: String(row["Conta Contábil (Amortização)"] || "").trim(),
              amortizationAccountDescription: String(row["Descrição Conta Amortização"] || "").trim(),
              resultAccountCode: String(row["Conta Contábil (Resultado)"] || "").trim(),
              resultAccountDescription: String(row["Descrição Conta Resultado"] || "").trim(),
            }
          };
        });

        const validationErrors = mappedData.filter(item => !item.data.code || !item.data.name || isNaN(item.data.usefulLife) || item.data.usefulLife < 0);
        if (validationErrors.length > 0) {
          toast.error("Dados inválidos na planilha.", { description: `Verifique as linhas: ${validationErrors.map(e => e.rowNum).join(", ")}. Colunas obrigatórias: Código, Nome e Vida Útil (número >= 0).`, duration: 8000 });
          return;
        }

      } catch (error) {
        console.error("Erro ao processar o arquivo:", error);
        toast.error("Erro na leitura da planilha.", { description: "O arquivo pode estar corrompido ou o formato dos dados é inválido. Verifique o template." });
        return;
      }

      // 4. Envio para o Backend
      try {
        const batch = writeBatch(db);
        mappedData.forEach((item: any) => {
            const docRef = doc(db, "asset_classes", item.data.code);
            batch.set(docRef, { ...item.data, createdAt: new Date().toISOString() }, { merge: true });
        });
        await batch.commit();
        toast.success(`${mappedData.length} classes importadas com sucesso!`);
        setSelectedFile(null);
      } catch (apiError: any) {
        console.error("Erro ao importar para o backend:", apiError);
        const defaultMessage = "Ocorreu um erro no servidor ao salvar os dados.";
        const description = apiError.message?.includes('Unique constraint failed')
          ? "Um ou mais 'Códigos de Classe' já existem no sistema. Verifique a planilha e tente novamente."
          : (apiError.message || defaultMessage);
        toast.error("Falha ao salvar os dados.", { description, duration: 8000 });
      }
      finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };
  
  const handleDownloadTemplate = () => {
    const headers = [
      "Código da Classe",
      "Nome da Classe",
      "Vida Útil (Anos)",
      "Vida Societária (Anos)",
      "Conta Contábil (Custo)",
      "Descrição Conta Custo",
      "Conta Contábil (Depreciação)",
      "Descrição Conta Depreciação",
      "Conta Contábil (Amortização)",
      "Descrição Conta Amortização",
      "Conta Contábil (Resultado)",
      "Descrição Conta Resultado"
    ];

    const exampleRow = [
      "3.01.01",
      "Veículos e Utilitários",
      "5",
      "5",
      "1.2.3.01.001",
      "Veículos (Custo)",
      "1.2.3.09.001",
      "(-) Depreciação Acum. Veículos",
      "",
      "",
      "3.1.1.01.001",
      "Despesa com Depreciação"
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);

    // Ajusta largura das colunas para melhor visualização
    const wscols = headers.map(h => ({ wch: h.length + 5 }));
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "template_importacao_classes.xlsx");
  };

  const handleEdit = (cls: AssetClass) => {
    setForm({
      code: cls.code,
      name: cls.name,
      usefulLife: String(cls.usefulLife),
      corporateUsefulLife: String(cls.corporateUsefulLife),
      assetAccountCode: cls.assetAccountCode || "",
      assetAccountDescription: cls.assetAccountDescription || "",
      depreciationAccountCode: cls.depreciationAccountCode || "",
      depreciationAccountDescription: cls.depreciationAccountDescription || "",
      amortizationAccountCode: cls.amortizationAccountCode || "",
      amortizationAccountDescription: cls.amortizationAccountDescription || "",
      resultAccountCode: cls.resultAccountCode || "",
      resultAccountDescription: cls.resultAccountDescription || "",
    });
    setEditingId(cls.id);
    setIsExpanded(true);
  };

  const cancelEdit = () => {
    setForm({ code: "", name: "", usefulLife: "", corporateUsefulLife: "", assetAccountCode: "", assetAccountDescription: "", depreciationAccountCode: "", depreciationAccountDescription: "", amortizationAccountCode: "", amortizationAccountDescription: "", resultAccountCode: "", resultAccountDescription: "" });
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        usefulLife: form.usefulLife ? Number(form.usefulLife) : 0,
        corporateUsefulLife: form.corporateUsefulLife ? Number(form.corporateUsefulLife) : 0,
        assetAccountCode: form.assetAccountCode?.trim() || "",
        assetAccountDescription: form.assetAccountDescription?.trim() || "",
        depreciationAccountCode: form.depreciationAccountCode?.trim() || "",
        depreciationAccountDescription: form.depreciationAccountDescription?.trim() || "",
        amortizationAccountCode: form.amortizationAccountCode?.trim() || "",
        amortizationAccountDescription: form.amortizationAccountDescription?.trim() || "",
        resultAccountCode: form.resultAccountCode?.trim() || "",
        resultAccountDescription: form.resultAccountDescription?.trim() || "",
      };

      if (editingId) {
        await updateDoc(doc(db, "asset_classes", editingId), payload);
        toast.success("Classe atualizada!");
      } else {
        await setDoc(doc(db, "asset_classes", payload.code), {
            ...payload,
            createdAt: new Date().toISOString()
        });
        toast.success("Classe criada!");
      }
      
      cancelEdit();
    } catch (error) {
      console.error(error);
      toast.error(editingId ? "Erro ao atualizar classe" : "Erro ao criar classe");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir classe?")) return;
    await deleteDoc(doc(db, "asset_classes", id));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <div>
            <CardTitle className="text-xl">Estrutura Unificada: Contas e Classes</CardTitle>
            <CardDescription className="text-base">Defina as classes de ativos e suas contas contábeis associadas.</CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => { cancelEdit(); setIsExpanded(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Classe
          </Button>
          <Button variant="outline" onClick={handleDownloadTemplate}>
            <Download className="w-4 h-4 mr-2" />
            Baixar Template
          </Button>
          <Button onClick={() => fileInputRef.current?.click()} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Importar Planilha
          </Button>
          <Input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleFileChange}
            accept=".xlsx, .xls"
          />
        </div>
      </CardHeader>
      {isExpanded && (
      <CardContent className="space-y-6">
        {selectedFile && (
          <div className="p-4 border rounded-lg bg-muted/40">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium">Arquivo selecionado: {selectedFile.name}</p>
              <Button onClick={handleFileUpload} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  "Confirmar Importação"
                )}
              </Button>
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4 bg-green-50 p-4 rounded-md border border-green-100">
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="text-base font-medium">Classe Imobilizado</label>
              <Input value={form.code} onChange={e => setForm({...form, code: e.target.value})} placeholder="Ex: 3.01.02" required />
            </div>
            <div className="col-span-3">
              <label className="text-base font-medium">Descrição Classe</label>
              <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Ex: Veículos" required />
            </div>
            <div>
              <label className="text-base font-medium">Vida Físcal</label>
              <Input type="number" value={form.usefulLife} onChange={e => setForm({...form, usefulLife: e.target.value})} placeholder="Ex: 5" required />
            </div>
            <div>
              <label className="text-base font-medium">Vida Societária</label>
              <Input type="number" value={form.corporateUsefulLife} onChange={e => setForm({...form, corporateUsefulLife: e.target.value})} placeholder="Ex: 8" required />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 border-t pt-4">
            <div>
              <label className="text-base font-medium">Conta Custo</label>
              <Input value={form.assetAccountCode} onChange={e => setForm({...form, assetAccountCode: e.target.value})} placeholder="Ex: 1.2.3.01.01" />
            </div>
            <div className="col-span-3">
              <label className="text-base font-medium">Descrição de Custo</label>
              <Input value={form.assetAccountDescription} onChange={e => setForm({...form, assetAccountDescription: e.target.value})} placeholder="Ex: Veículos (Custo)" />
            </div>
            <div>
              <label className="text-base font-medium">Conta Deprec</label>
              <Input value={form.depreciationAccountCode} onChange={e => setForm({...form, depreciationAccountCode: e.target.value})} placeholder="Ex: 1.2.3.09.01" />
            </div>
            <div className="col-span-3">
              <label className="text-base font-medium">Descrição Deprec</label>
              <Input value={form.depreciationAccountDescription} onChange={e => setForm({...form, depreciationAccountDescription: e.target.value})} placeholder="Ex: Depreciação Acumulada de Veículos" />
            </div>
            <div>
              <label className="text-base font-medium">Conta Amort</label>
              <Input value={form.amortizationAccountCode} onChange={e => setForm({...form, amortizationAccountCode: e.target.value})} placeholder="Ex: 1.2.5.01.02" />
            </div>
            <div className="col-span-3">
              <label className="text-base font-medium">Descrição Amort</label>
              <Input value={form.amortizationAccountDescription} onChange={e => setForm({...form, amortizationAccountDescription: e.target.value})} placeholder="Ex: Amortização Veículos" />
            </div>
            <div>
              <label className="text-base font-medium">Conta Resultado</label>
              <Input value={form.resultAccountCode} onChange={e => setForm({...form, resultAccountCode: e.target.value})} placeholder="Ex: 1.2.6.01.02" />
            </div>
            <div className="col-span-2">
              <label className="text-base font-medium">Descrição Resultado</label>
              <Input value={form.resultAccountDescription} onChange={e => setForm({...form, resultAccountDescription: e.target.value})} placeholder="Ex: Resultado Veículos" />
            </div>
            <div className="flex gap-2 items-end">
              {editingId && (
                <Button type="button" variant="outline" onClick={cancelEdit}>
                  <X className="w-4 h-4 mr-2" /> Cancelar
                </Button>
              )}
              <Button type="submit">
                {editingId ? <Pencil className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                {editingId ? "Salvar" : "Adicionar"}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
      )}
      <CardContent>
        {isLoading ? <Loader2 className="animate-spin" /> : (
          <Table className="text-base">
            <TableHeader>
              <TableRow>
                <TableHead className="text-base">Código</TableHead>
                <TableHead className="text-base">Classe</TableHead>
                <TableHead className="text-base">V. Útil</TableHead>
                <TableHead className="text-base">V. Societária</TableHead>
                <TableHead className="text-base">Custo</TableHead>
                <TableHead className="text-base">Deprec</TableHead>
                <TableHead className="text-base">Amort</TableHead>
                <TableHead className="text-base">Resultado</TableHead>
                <TableHead className="text-right text-base">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {classes?.map((cls: AssetClass) => (
                <TableRow key={cls.id}>
                  <TableCell className="font-mono text-base">{cls.code}</TableCell>
                  <TableCell>{cls.name}</TableCell>
                  <TableCell>{cls.usefulLife}</TableCell>
                  <TableCell>{cls.corporateUsefulLife}</TableCell>
                  <TableCell className="text-sm">
                    <div className="font-mono text-base">{cls.assetAccountCode}</div>
                    <div className="text-muted-foreground text-sm">{cls.assetAccountDescription}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="font-mono text-base">{cls.depreciationAccountCode}</div>
                    <div className="text-muted-foreground text-sm">{cls.depreciationAccountDescription}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="font-mono text-base">{cls.amortizationAccountCode}</div>
                    <div className="text-muted-foreground text-sm">{cls.amortizationAccountDescription}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="font-mono text-base">{cls.resultAccountCode}</div>
                    <div className="text-muted-foreground text-sm">{cls.resultAccountDescription}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(cls)}>
                      <Pencil className="w-4 h-4 text-blue-500" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(cls.id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function CostCentersTab() {
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "cost_centers"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CostCenter));
      setCenters(data);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const [form, setForm] = useState({ code: "", name: "", department: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleEdit = (cc: CostCenter) => {
    setForm({ code: cc.code, name: cc.name, department: cc.department });
    setEditingId(cc.id);
    setIsExpanded(true);
  };

  const cancelEdit = () => {
    setForm({ code: "", name: "", department: "" });
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateDoc(doc(db, "cost_centers", editingId), form);
        toast.success("Centro de custo atualizado!");
      } else {
        await addDoc(collection(db, "cost_centers"), {
            ...form,
            createdAt: new Date().toISOString()
        });
        toast.success("Centro de custo criado!");
      }
      cancelEdit();
    } catch (error) {
      toast.error(editingId ? "Erro ao atualizar centro de custo" : "Erro ao criar centro de custo");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir centro de custo?")) return;
    await deleteDoc(doc(db, "cost_centers", id));
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

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
          return;
        }

        const mappedData = json.map((row: any) => ({
          code: String(row["Código Centro de Custo"] || "").trim(),
          name: String(row["Nome Centro de Custo"] || "").trim(),
          department: String(row["Departamento"] || "").trim(),
        })).filter(item => item.code && item.name && item.department);

        if (mappedData.length === 0) {
          toast.error("Nenhum dado válido encontrado. Verifique as colunas 'Código Centro de Custo', 'Nome Centro de Custo' e 'Departamento'.");
          return;
        }

        const batch = writeBatch(db);
        mappedData.forEach((item: any) => {
            const newDocRef = doc(collection(db, "cost_centers"));
            batch.set(newDocRef, { ...item, createdAt: new Date().toISOString() });
        });
        await batch.commit();
        toast.success(`${mappedData.length} centros de custo importados!`);
      } catch (error) {
        console.error(error);
        toast.error("Erro ao processar arquivo.");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownloadTemplate = () => {
    const headers = ["Código Centro de Custo", "Nome Centro de Custo", "Departamento"];
    const example = ["CC-001", "Administrativo", "Diretoria"];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "template_centros_custo.xlsx");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <div>
            <CardTitle className="text-xl">Centros de Custo</CardTitle>
            <CardDescription className="text-base">Estrutura de centros de custo para alocação de despesas.</CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => { cancelEdit(); setIsExpanded(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Centro de Custo
          </Button>
          <Button variant="outline" onClick={handleDownloadTemplate}>
            <Download className="w-4 h-4 mr-2" />
            Template
          </Button>
          <Button onClick={() => fileInputRef.current?.click()} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Importar
          </Button>
          <Input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileUpload}
            accept=".xlsx, .xls"
          />
        </div>
      </CardHeader>
      {isExpanded && (
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="flex gap-4 items-end bg-green-50 p-4 rounded-md border border-green-100">
          <div className="w-1/4">
            <label className="text-base font-medium">Código</label>
            <Input value={form.code} onChange={e => setForm({...form, code: e.target.value})} placeholder="Ex: CC-01" required />
          </div>
          <div className="w-1/3">
            <label className="text-base font-medium">Nome</label>
            <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Ex: Administrativo" required />
          </div>
          <div className="flex-1">
            <label className="text-base font-medium">Departamento</label>
            <Input value={form.department} onChange={e => setForm({...form, department: e.target.value})} placeholder="Ex: Diretoria" required />
          </div>
          <div className="flex gap-2">
            {editingId && (
              <Button type="button" variant="outline" onClick={cancelEdit}>
                <X className="w-4 h-4 mr-2" /> Cancelar
              </Button>
            )}
            <Button type="submit">
              {editingId ? <Pencil className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              {editingId ? "Salvar" : "Adicionar"}
            </Button>
          </div>
        </form>
      </CardContent>
      )}
      <CardContent>
        {isLoading ? <Loader2 className="animate-spin" /> : (
          <Table className="text-base">
            <TableHeader>
              <TableRow>
                <TableHead className="text-base">Código</TableHead>
                <TableHead className="text-base">Nome</TableHead>
                <TableHead className="text-base">Departamento</TableHead>
                <TableHead className="text-right text-base">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {centers?.map((cc: CostCenter) => (
                <TableRow key={cc.id}>
                  <TableCell className="font-mono text-base">{cc.code}</TableCell>
                  <TableCell>{cc.name}</TableCell>
                  <TableCell>{cc.department}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(cc)}>
                      <Pencil className="w-4 h-4 text-blue-500" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(cc.id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}