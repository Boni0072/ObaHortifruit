import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, doc, updateDoc, addDoc, query, where } from "firebase/firestore";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { Loader2, ChevronDown, ChevronRight, Plus, CheckCircle2, ArrowRight, AlertTriangle, Check, XCircle, Download, Upload, QrCode, X, FileText, List, Eye } from "lucide-react";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

const ProjectWorkflow = ({ project, onUpdateStatus, compact }: { project: any, onUpdateStatus: (id: string, status: string, notes?: string) => Promise<void>, compact?: boolean }) => {
  const { user } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);
  const [rejectionOpen, setRejectionOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const steps = [
    { id: 'aguardando_classificacao', label: 'Classificação', requiredRole: 'classificacao', color: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-600', ring: 'ring-blue-200' },
    { id: 'aguardando_engenharia', label: 'Engenharia', requiredRole: 'engenharia', color: 'bg-yellow-500', border: 'border-yellow-500', text: 'text-yellow-600', ring: 'ring-yellow-200' },
    { id: 'aguardando_diretoria', label: 'Diretoria', requiredRole: 'diretoria', color: 'bg-orange-500', border: 'border-orange-500', text: 'text-orange-600', ring: 'ring-orange-200' },
    { id: 'aprovado', label: 'Aprovado', requiredRole: null, color: 'bg-green-500', border: 'border-green-500', text: 'text-green-600', ring: 'ring-green-200' }
  ];

  const isRejected = project.status === 'rejeitado';
  const currentStepIndex = steps.findIndex(s => s.id === project.status);
  const isCompleted = project.status === 'aprovado';
  const isUnknown = currentStepIndex === -1 && !isCompleted;
  const effectiveIndex = isCompleted ? steps.length - 1 : (currentStepIndex === -1 ? -1 : currentStepIndex);
  
  const userRole = (user as any)?.role;
  const currentStep = steps[currentStepIndex];
  const requiredRoleForCurrentStep = isUnknown ? steps[0].requiredRole : (currentStep ? currentStep.requiredRole : null);
  
  // A 'diretoria' pode aprovar qualquer etapa.
  const canApprove = userRole === 'diretoria' || userRole === requiredRoleForCurrentStep;
  
  const handleAdvance = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      if (isUnknown) {
        await onUpdateStatus(project.id, steps[0].id, undefined);
      } else if (currentStepIndex < steps.length - 1) {
        await onUpdateStatus(project.id, steps[currentStepIndex + 1].id, undefined);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason) {
      toast.error("Por favor, forneça uma justificativa para a rejeição.");
      return;
    }
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      await onUpdateStatus(project.id, 'rejeitado', rejectionReason);
      setRejectionOpen(false);
    } finally {
      setIsUpdating(false);
    }
  };

  if (compact) {
    return (
      <div className="flex flex-col gap-2 min-w-[140px]">
        <div className="relative flex items-center justify-between px-1 py-1">
          <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-full h-0.5 bg-slate-200 -z-10 rounded-full" />
          <div className={`absolute left-0 top-1/2 transform -translate-y-1/2 h-0.5 -z-10 transition-all duration-500 rounded-full ${effectiveIndex >= 0 ? steps[effectiveIndex].color : 'bg-blue-600'}`} style={{ width: effectiveIndex === -1 ? '0%' : `${(effectiveIndex / (steps.length - 1)) * 100}%` }} />
          {steps.map((step, index) => {
            const isCompletedStep = index <= effectiveIndex;
            const isCurrent = index === currentStepIndex;
            return (
              <div 
                key={step.id} 
                className={`
                  w-2.5 h-2.5 rounded-full border-2 z-10 transition-all duration-300
                  ${isCompletedStep 
                    ? `${step.color} ${step.border} scale-100` 
                    : 'bg-white border-slate-300 scale-90'
                  }
                  ${isCurrent && !isCompleted ? `ring-2 ${step.ring} ring-offset-1` : ''}
                `} 
                title={step.label} 
              />
            );
          })}
        </div>
        
        {!isCompleted && !isRejected && (
          <div className="flex gap-1">
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="w-full">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isUpdating || !canApprove}
                      className="w-full h-6 text-[10px] font-medium bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:text-blue-800 hover:border-blue-300 transition-colors rounded-full flex items-center justify-center gap-1 disabled:cursor-not-allowed"
                      onClick={(e) => { e.stopPropagation(); handleAdvance(); }}
                    >
                      {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : (
                        <>
                          {isUnknown ? "Iniciar" : "Aprovar"} <ArrowRight className="w-3 h-3" />
                        </>
                      )}
                    </Button>
                  </div>
                </TooltipTrigger>
                {!canApprove && <TooltipContent><p>Permissão: {requiredRoleForCurrentStep}</p></TooltipContent>}
              </Tooltip>
            </TooltipProvider>
            <Button
              variant="ghost"
              size="icon"
              disabled={isUpdating || !canApprove}
              className="h-6 w-6 text-red-500 hover:bg-red-100 disabled:cursor-not-allowed"
              onClick={(e) => { e.stopPropagation(); setRejectionOpen(true); }}
            >
              <XCircle size={14} />
            </Button>
          </div>
        )}
        {currentStepIndex === steps.length - 1 && !isCompleted && (
           <div className="text-center text-[10px] text-green-600 font-bold flex items-center justify-center gap-1 bg-green-50 py-0.5 rounded-full border border-green-100">
              <CheckCircle2 className="w-3 h-3" />
              Aprovado
           </div>
        )}
        {isRejected && (
          <div className="text-center text-[10px] text-red-600 font-bold flex items-center justify-center gap-1 bg-red-50 py-0.5 rounded-full border border-red-100">
            <XCircle className="w-3 h-3" />
            Rejeitado
          </div>
        )}
      </div>
    );
  }

  return (
    <>
    <Dialog open={rejectionOpen} onOpenChange={setRejectionOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rejeitar Projeto</DialogTitle>
          <DialogDescription>
            Por favor, forneça uma justificativa para a rejeição. Esta ação não poderá ser desfeita.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            placeholder="Digite a justificativa aqui..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRejectionOpen(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={handleReject} disabled={isUpdating}>Confirmar Rejeição</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <div className="mt-6 border-t pt-6">
      <div className="flex items-center justify-between mb-8">
        <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          Fluxo de Aprovação
          <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border">
            Etapa {currentStepIndex + 1} de {steps.length}
          </span>
        </h4>
      </div>
      
      <div className="relative flex items-center justify-between mb-36 px-4">
        <div className="absolute left-0 top-4 transform -translate-y-1/2 w-full h-1 bg-slate-100 -z-10 rounded-full" />
        <div className={`absolute left-0 top-4 transform -translate-y-1/2 h-1 -z-10 transition-all duration-500 rounded-full ${effectiveIndex >= 0 ? steps[effectiveIndex].color : 'bg-blue-600'}`} style={{ width: effectiveIndex === -1 ? '0%' : `${(effectiveIndex / (steps.length - 1)) * 100}%` }} />
        {steps.map((step, index) => { 
          const isCompletedStep = index <= effectiveIndex;
          const isCurrent = index === effectiveIndex;
          
          // Busca a aprovação que levou à PRÓXIMA etapa (quem aprovou esta etapa)
          const nextStep = steps[index + 1];
          const approvalInfo = nextStep 
            ? project.approvalHistory?.slice().reverse().find((h: any) => h.status === nextStep.id)
            : null;

          return (
            <div key={step.id} className="flex flex-col items-center group relative">
              <div 
                className={`
                  w-8 h-8 rounded-full border-2 z-10 transition-all duration-300 flex items-center justify-center
                  ${isCompletedStep 
                    ? `${step.color} ${step.border} shadow-md text-white scale-110` 
                    : 'bg-white border-slate-300 text-slate-400'
                  }
                  ${isCurrent && !isCompleted ? `ring-4 ${step.ring} ${step.border} ${step.text}` : ''}
                `}
              >
                {isCompletedStep ? <Check className="w-5 h-5" /> : (
                    isCurrent && !isCompleted ? <div className={`w-2.5 h-2.5 ${step.color} rounded-full animate-pulse`} /> : <span className="text-xs font-semibold">{index + 1}</span>
                )}
              </div>
              <span 
                className={`
                  absolute -bottom-8 text-xs font-medium whitespace-nowrap transition-colors
                  ${isCurrent ? `${step.text} font-bold` : isCompletedStep ? 'text-slate-700' : 'text-slate-400'}
                `}
              >
                {step.label}
              </span>
              {approvalInfo && (
                <div className="absolute top-24 flex flex-col items-center w-32 text-center">
                  <span className="text-[10px] font-bold text-slate-700 leading-tight">{approvalInfo.user}</span>
                  <span className="text-[9px] text-slate-500 leading-tight">{new Date(approvalInfo.date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      <div className="flex justify-end pt-4 border-t border-dashed">
        {!isCompleted && !isRejected && (
          <div className="flex gap-2">
            <Button 
              size="sm" 
              variant="destructive"
              disabled={isUpdating || !canApprove}
              onClick={(e) => { e.stopPropagation(); setRejectionOpen(true); }}
            >
              <XCircle className="mr-2 w-4 h-4" /> Rejeitar
            </Button>
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="inline-block">
                    <Button 
                      size="sm" 
                      disabled={isUpdating || !canApprove}
                      className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all disabled:cursor-not-allowed" 
                      onClick={(e) => { e.stopPropagation(); handleAdvance(); }}
                    >
                      {isUpdating ? (
                          <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processando...
                          </>
                      ) : (
                          <>
                              {isUnknown ? "Iniciar Processo" : `Aprovar ${steps[currentStepIndex + 1]?.label}`} <ArrowRight className="ml-2 w-4 h-4" />
                          </>
                      )}
                    </Button>
                  </div>
                </TooltipTrigger>
                {!canApprove && <TooltipContent><p>Permissão necessária: {requiredRoleForCurrentStep}</p></TooltipContent>}
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
        {isCompleted && (
           <div className="flex items-center text-sm text-green-600 font-medium bg-green-50 px-4 py-2 rounded-md border border-green-200 shadow-sm">
              <CheckCircle2 className="w-5 h-5 mr-2" />
              Projeto Totalmente Aprovado
           </div>
        )}
        {isRejected && (
          <div className="flex items-center text-sm text-red-600 font-medium bg-red-50 px-4 py-2 rounded-md border border-red-200 shadow-sm">
            <XCircle className="w-5 h-5 mr-2" />
            <span>Projeto Rejeitado. Motivo: <em>{project.notes || "Não especificado."}</em></span>
          </div>
        )}
      </div>
    </div>
    </>
  );
};

type ProjectType = any;

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

function CreateAssetDialog({
  open,
  onOpenChange,
  projectId,
  initialData,
  onSuccess
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  initialData: { description: string; amount: string; date?: string };
  onSuccess: (assetId: string | number) => void;
}) {
  const utils = trpc.useUtils();
  const createMutation = trpc.assets.create.useMutation();
  const { data: assetClasses } = trpc.accounting.listAssetClasses.useQuery();
  const { data: nextAssetNumber } = trpc.assets.getNextNumber.useQuery(undefined, {
    enabled: open
  });

  const [formData, setFormData] = useState({
    assetNumber: "",
    tagNumber: "",
    name: "",
    description: "",
    value: "",
    startDate: new Date().toISOString().split("T")[0],
    assetClass: "",
    usefulLife: "",
    corporateUsefulLife: "",
    accountingAccount: "",
    depreciationAccountCode: "",
    amortizationAccountCode: "",
    resultAccountCode: "",
  });

  useEffect(() => {
    if (open) {
      setFormData(prev => ({
        ...prev,
        name: initialData.description || "",
        description: initialData.description || "",
        value: initialData.amount ? String(initialData.amount) : "",
        startDate: initialData.date ? new Date(initialData.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
        assetNumber: nextAssetNumber || prev.assetNumber
      }));
    }
  }, [open, initialData, nextAssetNumber]);

  useEffect(() => {
    if (open && nextAssetNumber && !formData.assetNumber) {
      setFormData(prev => ({ ...prev, assetNumber: nextAssetNumber }));
    }
  }, [open, nextAssetNumber]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isNaN(Number(formData.assetNumber))) {
      toast.error("O Número do Ativo deve ser numérico para ser vinculado a despesas.");
      return;
    }
    try {
      const result = await createMutation.mutateAsync({
        projectId,
        assetNumber: formData.assetNumber,
        tagNumber: formData.tagNumber || undefined,
        name: formData.name,
        description: formData.description,
        value: formData.value,
        startDate: new Date(formData.startDate),
        assetClass: formData.assetClass,
        usefulLife: Number(formData.usefulLife),
        corporateUsefulLife: Number(formData.corporateUsefulLife),
        accountingAccount: formData.accountingAccount,
        depreciationAccountCode: formData.depreciationAccountCode,
        amortizationAccountCode: formData.amortizationAccountCode,
        resultAccountCode: formData.resultAccountCode,
      } as any);
      
      toast.success("Ativo criado com sucesso!");
      utils.assets.list.invalidate({ projectId: String(projectId) });
      utils.assets.getNextNumber.invalidate();
      onSuccess(result.id);
      onOpenChange(false);
    } catch (error) {
      toast.error("Erro ao criar ativo");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Novo Ativo (via Despesa)</DialogTitle>
          <DialogDescription>
            Preencha os dados abaixo para criar um novo ativo vinculado a esta despesa.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Número do Ativo</label>
              <Input value={formData.assetNumber} readOnly className="bg-slate-100 font-mono" />
            </div>
            <div>
              <label className="text-sm font-medium">Nº Plaqueta</label>
              <Input value={formData.tagNumber} onChange={e => setFormData({...formData, tagNumber: e.target.value})} placeholder="Ex: PAT-001" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Nome do Ativo</label>
            <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
          </div>
          <div>
            <label className="text-sm font-medium">Classe do Imobilizado</label>
            <Select value={formData.assetClass} onValueChange={handleAssetClassChange}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {assetClasses?.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Valor (R$)</label>
              <Input type="number" step="0.01" value={formData.value} onChange={e => setFormData({...formData, value: e.target.value})} />
            </div>
            <div>
              <label className="text-sm font-medium">Data Início</label>
              <Input type="date" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} required />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Criando..." : "Criar Ativo"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseRow({ expense, accountingAccounts, assets, onSave, onOpenCreateAsset }: { 
  expense: any, 
  accountingAccounts: any[], 
  assets: any[], 
  onSave: (data: any) => Promise<void>,
  onOpenCreateAsset: (expense: any, cb: (id: string | number) => void) => void,
}) {
  const [type, setType] = useState<"capex" | "opex">(expense.type || "opex");
  const [accountingAccount, setAccountingAccount] = useState(expense.accountingAccount || "");
  const [assetId, setAssetId] = useState(() => {
    const val = (expense.assetId !== null && expense.assetId !== undefined) ? String(expense.assetId) : "";
    // Previne que "NaN" vindo do banco ou estado anterior quebre a edição
    return (val === "NaN" || val === "nan") ? "" : val;
  });
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [viewItemsOpen, setViewItemsOpen] = useState(false);

  useEffect(() => {
    const val = (expense.assetId !== null && expense.assetId !== undefined) ? String(expense.assetId) : "";
    const cleanVal = (val === "NaN" || val === "nan") ? "" : val;
    setAssetId(cleanVal);
  }, [expense.assetId]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      
      let finalAssetId: string | number | null = null;
      if (type === 'capex') {
        if (!assetId) {
          toast.error("Selecione um ativo válido para despesas Capex.");
          setIsSaving(false);
          return;
        }
        finalAssetId = assetId;
      }

      const updatePayload: any = {
        id: expense.id,
        type,
        assetId: finalAssetId,
        description: expense.description,
        amount: String(expense.amount),
        date: expense.date, // Mantém o formato original (Timestamp ou string) para o updateDoc processar ou converter se necessário
        category: expense.category || "",
        notes: expense.notes || "",
      };

      if (type === 'opex' && accountingAccount) {
        updatePayload.accountingAccount = accountingAccount;
      }

      await onSave(updatePayload);
      setIsDirty(false);
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar as alterações.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
    <tr key={`expense-${expense.id}`}>
      <td className="border border-slate-300 px-3 py-2">{expense.description}</td>
      <td className="border border-slate-300 px-3 py-2 font-mono text-xs text-muted-foreground">
        {expense.invoiceNumber || expense.notes?.match(/NF-e:\s*(\d{44})/)?.[1] || "-"}
      </td>
      <td className="border border-slate-300 px-3 py-2 text-center">
        {(expense.items && expense.items.length > 0) ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setViewItemsOpen(true)}
          >
            <Eye size={14} className="text-blue-600" />
          </Button>
        ) : "-"}
      </td>
      <td className="border border-slate-300 px-3 py-2">
        {type === 'opex' ? (
          <Select
            value={accountingAccount}
            onValueChange={(val) => {
              setAccountingAccount(val);
              setIsDirty(true);
            }}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {accountingAccounts?.map((acc) => (
                <SelectItem key={acc.id} value={acc.code}>
                  {acc.code} - {acc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="text-center text-slate-400">—</div>
        )}
      </td>
      <td className="border border-slate-300 px-3 py-2">
        {type === 'capex' ? (
          <div className="flex gap-1">
            <Select
              value={assetId}
              onValueChange={(val) => {
                setAssetId(val);
                setIsDirty(true);
              }}
            >
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue placeholder="Selecione o Ativo" />
              </SelectTrigger>
              <SelectContent>
                {assets?.map((asset) => (
                  <SelectItem key={asset.id} value={String(asset.id)}>
                    {asset.tagNumber ? `${asset.tagNumber} - ${asset.name}` : asset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              size="icon" 
              variant="outline" 
              className="h-7 w-7 shrink-0" 
              title="Novo Ativo"
              onClick={() => onOpenCreateAsset(expense, (newId) => {
                setAssetId(String(newId));
                setIsDirty(true);
              })}
            >
              <Plus size={14} />
            </Button>
          </div>
        ) : (
          <div className="text-center text-slate-400">—</div>
        )}
      </td>
      <td className="border border-slate-300 px-3 py-2">
        <Select
          value={type}
          onValueChange={(val) => {
            setType(val as "capex" | "opex");
            if (val === 'capex') {
              setAccountingAccount('');
            } else {
              setAssetId('');
            }
            setIsDirty(true);
          }}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="capex">Capex</SelectItem>
            <SelectItem value="opex">Opex</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="border border-slate-300 px-3 py-2 text-right font-mono">{formatCurrency(Number(expense.amount))}</td>
      <td className="border border-slate-300 px-3 py-2 text-center">
        {isDirty && (
          <Button
            size="sm"
            className="h-7 text-xs bg-green-600 hover:bg-green-700"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Gravar"}
          </Button>
        )}
      </td>
    </tr>

    <Dialog open={viewItemsOpen} onOpenChange={setViewItemsOpen}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Itens da Despesa: {expense.description}</DialogTitle>
          {expense.invoiceNumber && (
            <DialogDescription>
              Nota Fiscal: <span className="font-mono font-medium text-slate-700">{expense.invoiceNumber}</span>
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="mt-4 max-h-[60vh] overflow-y-auto">
          {expense.items && expense.items.length > 0 ? (
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
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {expense.items.map((prod: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-2 py-1 font-mono">{prod.code}</td>
                      <td className="px-2 py-1">{prod.description}</td>
                      <td className="px-2 py-1">{prod.ncm}</td>
                      <td className="px-2 py-1">{prod.orig}/{prod.cst}</td>
                      <td className="px-2 py-1">{prod.cfop}</td>
                      <td className="px-2 py-1">{prod.unit}</td>
                      <td className="px-2 py-1 text-right">{prod.quantity}</td>
                      <td className="px-2 py-1 text-right">{Number(prod.unitPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="px-2 py-1 text-right font-medium">{Number(prod.totalPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-gray-500 py-4">Nenhum item detalhado encontrado.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

// This component fetches data for a single project row.
// NOTE: This approach causes a "N+1" query problem, where each row triggers its own data fetching.
// For production, it's recommended to create a dedicated tRPC endpoint that aggregates this data on the server.
function ProjectBudgetRow({ project, onDataLoaded }: { project: ProjectType, onDataLoaded?: (id: string, planned: number, realized: number) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();
  
  const [assets, setAssets] = useState<any[]>([]);
  useEffect(() => {
    const q = query(collection(db, "assets"), where("projectId", "==", String(project.id)));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAssets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [project.id]);

  const { data: budgets } = trpc.budgets.listByProject.useQuery({ projectId: project.id });
  
  const [expenses, setExpenses] = useState<any[]>([]);
  useEffect(() => {
    const q = query(collection(db, "expenses"), where("projectId", "==", String(project.id)));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [project.id]);

  const { data: accountingAccounts } = trpc.accounting.listAccounts.useQuery();

  const monthlyEvolution = useMemo(() => {
    if (!expenses) return [];
    const evolution: Record<string, number> = {};
    
    expenses.forEach((expense) => {
      if (!expense.date) return;
      
      let date: Date;
      // Tratamento para Timestamp do Firestore vs String ISO
      if (expense.date?.toDate) date = expense.date.toDate();
      else date = new Date(expense.date);

      if (isNaN(date.getTime())) return;
      
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      evolution[key] = (evolution[key] || 0) + Number(expense.amount);
    });

    return Object.entries(evolution)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, amount]) => {
        const [year, month] = key.split('-');
        const date = new Date(Number(year), Number(month) - 1, 1);
        const monthName = date.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        return { key, label: monthName.charAt(0).toUpperCase() + monthName.slice(1), amount };
      });
  }, [expenses]);

  const realizedFromExpenses = expenses?.reduce((acc, expense) => acc + Number(expense.amount), 0) || 0;
  const budgetRealizado = realizedFromExpenses;
  const budgetPlanejado = project.plannedValue ? Number(project.plannedValue) : (budgets?.reduce((acc, budget) => acc + Number(budget.plannedAmount), 0) || 0);
  const budgetVariacao = budgetPlanejado - budgetRealizado;
  const budgetProgresso = budgetPlanejado > 0 ? (budgetRealizado / budgetPlanejado) * 100 : 0;
  const status = budgetRealizado <= budgetPlanejado ? "Dentro do Orçamento" : "Acima do Orçamento";
  const statusColor = budgetRealizado <= budgetPlanejado ? "text-green-600" : "text-red-600";
  
  let progressColor = "bg-blue-600";
  if (budgetProgresso >= 90 && budgetProgresso <= 95) {
    progressColor = "bg-yellow-500 animate-pulse";
  } else if (budgetProgresso > 95) {
    progressColor = "bg-green-500";
  }

  const assetNumbers = assets?.map(asset => (asset as any).assetNumber).filter(Boolean).join(', ');
  const itemPrincipal = assetNumbers || (budgets?.[0] as any)?.description || "N/A";

  const utils = trpc.useUtils();

  const [createAssetOpen, setCreateAssetOpen] = useState(false);
  const [assetCreationCallback, setAssetCreationCallback] = useState<((id: string | number) => void) | null>(null);
  const [selectedExpenseForAsset, setSelectedExpenseForAsset] = useState<any>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const steps = [
    { id: 'aguardando_classificacao', label: 'Classificação', color: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-600', ring: 'ring-blue-200' },
    { id: 'aguardando_engenharia', label: 'Engenharia', color: 'bg-yellow-500', border: 'border-yellow-500', text: 'text-yellow-600', ring: 'ring-yellow-200' },
    { id: 'aguardando_diretoria', label: 'Diretoria', color: 'bg-orange-500', border: 'border-orange-500', text: 'text-orange-600', ring: 'ring-orange-200' },
    { id: 'aprovado', label: 'Aprovado', color: 'bg-green-500', border: 'border-green-500', text: 'text-green-600', ring: 'ring-green-200' }
  ];

  const handleOpenCreateAsset = (expense: any, callback: (id: string | number) => void) => {
    setSelectedExpenseForAsset(expense);
    setAssetCreationCallback(() => callback);
    setCreateAssetOpen(true);
  };

  const handleUpdateStatus = async (id: string, newStatus: string, notes?: string) => {
    try {
      const historyEntry = {
        status: newStatus,
        date: new Date().toISOString(),
        user: user?.name || "Usuário",
        role: (user as any)?.role || "",
        notes: notes
      };
      const newHistory = [...(project.approvalHistory || []), historyEntry];

      await updateDoc(doc(db, "projects", id), {
        status: newStatus,
        notes: notes || null,
        approvalHistory: newHistory,
        updatedAt: new Date().toISOString()
      });
      const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
      audio.play().catch(e => console.error("Audio play failed", e));
      toast.success("Status do projeto atualizado!");
    } catch (error: any) {
      console.error("Erro ao atualizar status:", error);
      if (error.message?.includes("Não autorizado") || error.data?.code === "FORBIDDEN" || error.message?.includes("Forbidden")) {
        toast.error("Permissão Negada", {
          description: "Você não possui permissão para aprovar esta etapa do projeto."
        });
      } else {
        toast.error("Erro ao atualizar status", {
          description: "Ocorreu um erro inesperado. Tente novamente."
        });
      }
    }
  };

  useEffect(() => {
    if (onDataLoaded) {
      onDataLoaded(String(project.id), budgetPlanejado, budgetRealizado);
    }
  }, [project.id, budgetPlanejado, budgetRealizado, onDataLoaded]);

  return (
    <>
      <tr className="hover:bg-slate-50 cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        <td className="px-4 py-3 font-medium text-slate-700">
          <div className="flex items-center gap-2">
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span 
              className="hover:text-blue-600 hover:underline"
              onClick={(e) => { e.stopPropagation(); setIsDetailsOpen(true); }}
            >
              {project.name}
            </span>
          </div>
        </td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <ProjectWorkflow project={project} onUpdateStatus={handleUpdateStatus} compact />
        </td>
        <td className="px-4 py-3">
          <span className={`px-2 py-1 rounded-full text-xs font-medium w-fit ${statusColors[project.status] || 'bg-gray-100 text-gray-800'}`}>
            {project.status.replace(/_/g, ' ')}
          </span>
        </td>
        <td className="px-4 py-3 text-gray-600">{project.estimatedEndDate ? new Date(project.estimatedEndDate).toLocaleDateString("pt-BR") : "-"}</td>
        <td className="px-4 py-3 text-gray-600">{itemPrincipal}</td>
        <td className={`px-4 py-3 font-semibold ${statusColor}`}>{status}</td>
        <td className="px-4 py-3 text-right font-mono">{formatCurrency(budgetPlanejado)}</td>
        <td className="px-4 py-3 text-right font-mono">{formatCurrency(budgetRealizado)}</td>
        <td className="px-4 py-3 text-right font-mono">{formatCurrency(budgetVariacao)}</td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <span>{budgetProgresso.toFixed(1)}%</span>
            <div className="w-24 bg-gray-200 rounded-full h-2.5">
              <div className={`${progressColor} h-2.5 rounded-full`} style={{ width: `${budgetProgresso > 100 ? 100 : budgetProgresso}%` }}></div>
            </div>
          </div>
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={10} className="p-4 bg-slate-50 border-t">
            <div className="w-full">
              <h4 className="text-md font-semibold text-slate-700 mb-4">Detalhamento do Realizado</h4>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                <h5 className="text-sm font-medium text-gray-600 mb-2">Lista de Despesas</h5>
                {(expenses && expenses.length > 0) ? (
                  <div className="overflow-hidden rounded-lg border">
                    <table className="w-full text-sm border-collapse bg-white">
                      <caption className="caption-bottom text-sm text-muted-foreground p-2 bg-white">
                        Ativos e despesas que compõem o valor realizado.
                      </caption>
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="border border-slate-300 px-3 py-2 font-medium text-gray-600 text-left">Descrição</th>
                          <th className="border border-slate-300 px-3 py-2 font-medium text-gray-600 text-left">Nota Fiscal</th>
                          <th className="border border-slate-300 px-3 py-2 font-medium text-gray-600 text-center">Itens</th>
                          <th className="border border-slate-300 px-3 py-2 font-medium text-gray-600 text-left">Anexo</th>
                          <th className="border border-slate-300 px-3 py-2 font-medium text-gray-600 text-left">Conta Contábil</th>
                          <th className="border border-slate-300 px-3 py-2 font-medium text-gray-600 text-left">Ativo</th>
                          <th className="border border-slate-300 px-3 py-2 font-medium text-gray-600 text-left">Classificação</th>
                          <th className="border border-slate-300 px-3 py-2 font-medium text-gray-600 text-right">Valor</th>
                          <th className="border border-slate-300 px-3 py-2 font-medium text-gray-600 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenses?.map((expense) => (
                          <ExpenseRow 
                            key={expense.id} 
                            expense={expense} 
                            accountingAccounts={accountingAccounts || []} 
                            assets={assets || []} 
                            onSave={async (data) => {
                              const { id, ...updateData } = data;
                              // Garante que a data seja salva corretamente se foi alterada
                              if (updateData.date instanceof Date) {
                                updateData.date = updateData.date.toISOString();
                              }
                              await updateDoc(doc(db, "expenses", id), updateData);
                              toast.success("Despesa atualizada");
                            }}
                            onOpenCreateAsset={handleOpenCreateAsset}
                          />
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 font-bold">
                        <tr>
                          <td colSpan={6} className="border border-slate-300 px-3 py-2 text-right">Total Acumulado</td>
                          <td className="border border-slate-300 px-3 py-2 text-right font-mono">{formatCurrency(budgetRealizado)}</td>
                          <td className="border border-slate-300 px-3 py-2"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : <p className="text-sm text-gray-500 mt-4 text-center">Nenhum custo realizado encontrado.</p>}
                </div>

                <div>
                  <h5 className="text-sm font-medium text-gray-600 mb-2">Evolução do Projeto</h5>
                  <div className="overflow-hidden rounded-lg border bg-white">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Mês</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-600">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {monthlyEvolution.length > 0 ? (
                          monthlyEvolution.map((item) => (
                            <tr key={item.key}>
                              <td className="px-3 py-2 text-gray-700">{item.label}</td>
                              <td className="px-3 py-2 text-right font-mono text-gray-700">{formatCurrency(item.amount)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={2} className="px-3 py-4 text-center text-gray-500 text-xs">Sem dados de evolução.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
      
      {createAssetOpen && (
        <CreateAssetDialog 
          open={createAssetOpen} 
          onOpenChange={setCreateAssetOpen}
          projectId={project.id}
          initialData={selectedExpenseForAsset || {}}
          onSuccess={(newId) => {
            if (assetCreationCallback) assetCreationCallback(newId);
          }}
        />
      )}

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Projeto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="py-4 mb-20">
              <h4 className="text-sm font-semibold text-slate-700 mb-6">Fluxo de Aprovação</h4>
              <div className="relative flex items-center justify-between px-4">
                <div className="absolute left-0 top-4 transform -translate-y-1/2 w-full h-1 bg-slate-100 -z-10 rounded-full" />
                <div 
                  className={`absolute left-0 top-4 transform -translate-y-1/2 h-1 -z-10 transition-all duration-500 rounded-full ${
                    steps.findIndex(s => s.id === project.status) >= 0 ? steps[steps.findIndex(s => s.id === project.status)].color : 'bg-blue-600'
                  }`} 
                  style={{ width: `${(Math.max(0, steps.findIndex(s => s.id === project.status)) / (steps.length - 1)) * 100}%` }} 
                />
                {steps.map((step, index) => {
                  const currentStepIndex = steps.findIndex(s => s.id === project.status);
                  const isCompletedStep = index <= currentStepIndex;
                  const isCurrent = index === currentStepIndex;
                  
                  const nextStep = steps[index + 1];
                  const approvalInfo = nextStep 
                    ? project.approvalHistory?.slice().reverse().find((h: any) => h.status === nextStep.id)
                    : null;

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
                        <div className="absolute top-16 flex flex-col items-center w-40 text-center z-20">
                          <span className="text-sm font-bold text-slate-700 leading-tight">{approvalInfo.user}</span>
                          <span className="text-xs text-slate-500 leading-tight">{new Date(approvalInfo.date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-sm text-gray-500">Descrição</h4>
              <p className="text-slate-700">{project.description || "Sem descrição"}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold text-sm text-gray-500">Centro de Custo</h4>
                <p className="text-slate-700">{project.costCenter || "-"}</p>
              </div>
              <div>
                <h4 className="font-semibold text-sm text-gray-500">Data de Início</h4>
                <p className="text-slate-700">{new Date(project.startDate).toLocaleDateString("pt-BR")}</p>
              </div>
            </div>
             <div className="grid grid-cols-3 gap-4">
                <div>
                  <h4 className="font-semibold text-sm text-gray-500">Capex</h4>
                  <p className="text-slate-700 font-mono">{formatCurrency(Number(project.plannedCapex || 0))}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-gray-500">Opex</h4>
                  <p className="text-slate-700 font-mono">{formatCurrency(Number(project.plannedOpex || 0))}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-gray-500">Valor Planejado</h4>
                  <p className="text-slate-700 font-mono">{formatCurrency(Number(project.plannedValue || 0))}</p>
                </div>
              </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}




export default function BudgetsPage() {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewProject, setViewProject] = useState<any | null>(null);

  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

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

          if ('BarcodeDetector' in window) {
             try {
                 // @ts-ignore
                 const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13', 'itf'] });
                 interval = setInterval(async () => {
                    if (videoRef.current && videoRef.current.readyState === 4) {
                        try {
                            const barcodes = await detector.detect(videoRef.current);
                            if (barcodes.length > 0) {
                                const rawValue = barcodes[0].rawValue;
                                const match = rawValue.match(/\d{44}/);
                                if (match) {
                                    setNfeKey(match[0]);
                                    setIsScanning(false);
                                    toast.success("Chave da NF-e lida com sucesso!");
                                }
                            }
                        } catch (e) {}
                    }
                 }, 500);
             } catch (e) { console.warn("BarcodeDetector error", e); }
          }
        })
        .catch(err => {
          console.error("Erro câmera", err);
          toast.error("Erro ao acessar câmera.");
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

  const steps = [
    { id: 'aguardando_classificacao', label: 'Classificação', color: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-600', ring: 'ring-blue-200' },
    { id: 'aguardando_engenharia', label: 'Engenharia', color: 'bg-yellow-500', border: 'border-yellow-500', text: 'text-yellow-600', ring: 'ring-yellow-200' },
    { id: 'aguardando_diretoria', label: 'Diretoria', color: 'bg-orange-500', border: 'border-orange-500', text: 'text-orange-600', ring: 'ring-orange-200' },
    { id: 'aprovado', label: 'Aprovado', color: 'bg-green-500', border: 'border-green-500', text: 'text-green-600', ring: 'ring-green-200' }
  ];

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "projects"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(data);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [totals, setTotals] = useState<Record<string, { planned: number; realized: number }>>({});

  const filteredProjects = projects?.filter(p => selectedProjectId === "all" || String(p.id) === selectedProjectId);

  const handleDataLoaded = useCallback((id: string, planned: number, realized: number) => {
    setTotals(prev => {
      if (prev[id]?.planned === planned && prev[id]?.realized === realized) return prev;
      return { ...prev, [id]: { planned, realized } };
    });
  }, []);

  const totalPlanned = filteredProjects?.reduce((acc, p) => acc + (totals[String(p.id)]?.planned || 0), 0) || 0;
  const totalRealized = filteredProjects?.reduce((acc, p) => acc + (totals[String(p.id)]?.realized || 0), 0) || 0;
  const totalAvailable = totalPlanned - totalRealized;

  // --- Nova Despesa Logic ---
  const [openExpenseDialog, setOpenExpenseDialog] = useState(false);
  const [nfeKey, setNfeKey] = useState("");
  const [isFetchingNfe, setIsFetchingNfe] = useState(false);
  const [expenseFormData, setExpenseFormData] = useState({
    description: "",
    amount: "",
    quantity: "1",
    type: "capex" as "capex" | "opex",
    category: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
    assetId: null as string | null,
    projectId: "",
    invoiceNumber: "",
    attachment: null as File | null,
    ncm: "",
    cfop: "",
    unit: "",
  });
  const [nfeProducts, setNfeProducts] = useState<any[]>([]);

  // const fetchNfeMutation = trpc.expenses.fetchNfeData.useMutation(); // Removido para simulação

  const { data: assetsForDialog } = trpc.assets.list.useQuery(
    { projectId: expenseFormData.projectId || undefined },
    { enabled: !!expenseFormData.projectId }
  );

  const handleOpenExpenseDialog = (open: boolean) => {
    setOpenExpenseDialog(open);
    if (open) {
      setExpenseFormData({
        description: "",
        amount: "",
        quantity: "1",
        type: "capex",
        category: "",
        date: new Date().toISOString().split("T")[0],
        notes: "",
        assetId: null,
        projectId: selectedProjectId === "all" ? "" : selectedProjectId,
        invoiceNumber: "",
        attachment: null,
        ncm: "",
        cfop: "",
        unit: "",
      });
      setNfeProducts([]);
      setNfeKey("");
    }
  };

  const nfeMutation = trpc.nfe.consultar.useMutation({
    onSuccess: (data) => {
      toast.success("Dados da NF-e importados com sucesso!", {
        id: "fetch-nfe",
        description: "Dados extraídos do portal da NF-e.",
      });

      let formDescription = data.description;
      let formAmount = data.amount ? String(data.amount) : expenseFormData.amount;
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
              formNotes += `\n\nDetalhes do Item:\nCód: ${p.code}\nNCM: ${p.ncm}\nUnidade: ${p.unit}`;
          } else {
              formDescription = `NF-e ${nfeKey} - ${data.products.length} itens`;
              formNotes += "\n\nItens da Nota:\n" + data.products.map((p: any) => `- ${p.description} (${p.quantity} ${p.unit}) R$ ${p.totalPrice.toFixed(2)} | NCM: ${p.ncm}`).join("\n");
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

      setExpenseFormData(prev => ({
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

    setExpenseFormData(prev => ({ ...prev, attachment: file }));

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
        
        setExpenseFormData(prev => ({
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
    } else {
      toast.info("Arquivo anexado.", {
        description: "Para preenchimento automático dos campos e itens, utilize o arquivo XML da nota fiscal. O PDF serve apenas como anexo."
      });
    }
  };

  const handleAddProductRow = () => {
    setNfeProducts([...nfeProducts, {
      code: "", description: "", ncm: "", cst: "", cfop: "", unit: "", quantity: 0, unitPrice: 0, totalPrice: 0
    }]);
  };

  const handleRemoveProductRow = (index: number) => {
    const newProducts = [...nfeProducts];
    newProducts.splice(index, 1);
    setNfeProducts(newProducts);
  };

  const handleProductChange = (index: number, field: string, value: any) => {
    const newProducts = [...nfeProducts];
    newProducts[index] = { ...newProducts[index], [field]: value };
    if (field === 'quantity' || field === 'unitPrice') {
        newProducts[index].totalPrice = Number(newProducts[index].quantity) * Number(newProducts[index].unitPrice);
    }
    setNfeProducts(newProducts);
  };

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseFormData.projectId) {
      toast.error("Selecione uma obra");
      return;
    }

    const selectedProjectForExpense = projects.find(p => String(p.id) === String(expenseFormData.projectId));
    const isExpenseBlocked = selectedProjectForExpense?.status === 'concluido' || selectedProjectForExpense?.status === 'rejeitado';

    if (isExpenseBlocked) {
      toast.error("Este projeto está concluído ou rejeitado e as despesas estão bloqueadas.");
      return;
    }

    if (expenseFormData.type === 'capex' && !expenseFormData.assetId) {
      toast.error("Selecione um ativo válido para despesas Capex.");
      return;
    }

    try {
      let finalAssetId: string | number | undefined;
      if (expenseFormData.type === 'capex' && expenseFormData.assetId !== null) {
        finalAssetId = expenseFormData.assetId;
      }

      await addDoc(collection(db, "expenses"), {
        projectId: expenseFormData.projectId,
        description: expenseFormData.description,
        amount: expenseFormData.amount,
        quantity: Number(expenseFormData.quantity) || 1,
        type: expenseFormData.type,
        category: expenseFormData.category || "",
        date: new Date(expenseFormData.date),
        notes: expenseFormData.notes || "",
        assetId: finalAssetId,
        invoiceNumber: expenseFormData.invoiceNumber,
        attachmentUrl: null, // Não estamos salvando o arquivo, então attachmentUrl é null
        ncm: expenseFormData.ncm,
        cfop: expenseFormData.cfop,
        unit: expenseFormData.unit,
        items: nfeProducts,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      toast.success("Despesa criada com sucesso!");
      setOpenExpenseDialog(false);
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar despesa");
    }
  };

  const selectedProjectForExpense = projects.find(p => String(p.id) === String(expenseFormData.projectId));
  const isExpenseBlocked = selectedProjectForExpense?.status === 'concluido' || selectedProjectForExpense?.status === 'rejeitado';
  // ---------------------------

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleDownloadTemplate = () => {
    const headers = [
      "Descrição",
      "Valor",
      "Quantidade",
      "Tipo (Capex/Opex)",
      "Categoria",
      "Data (AAAA-MM-DD)",
      "Notas",
      "Nome da Obra (Opcional)",
      "Número do Ativo (Se Capex)"
    ];
    const example = [
      "Compra de Cimento",
      "500.00",
      "10",
      "opex",
      "Materiais",
      new Date().toISOString().split('T')[0],
      "Nota fiscal 123",
      "Obra 01",
      ""
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    
    ws['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 30 }, { wch: 25 }, { wch: 20 }];
    
    XLSX.utils.book_append_sheet(wb, ws, "Template Despesas");
    XLSX.writeFile(wb, "template_importacao_despesas.xlsx");
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

        let assetsMap: Record<string, string> = {};
        try {
            const allAssets = await utils.assets.list.fetch({});
            allAssets.forEach((a: any) => {
                if (a.assetNumber) assetsMap[String(a.assetNumber)] = String(a.id);
            });
        } catch (err) {
            console.error("Failed to fetch assets for import resolution", err);
        }

        let successCount = 0;
        let errorCount = 0;
        
        const promises = json.map(async (row: any) => {
            try {
                const projectName = row["Nome da Obra (Opcional)"];
                let projectId = "";
                
                if (projectName) {
                    const project = projects.find(p => p.name.toLowerCase() === (projectName as string).toLowerCase());
                    if (project) projectId = String(project.id);
                } else if (selectedProjectId !== "all") {
                    projectId = selectedProjectId;
                }

                if (!projectId) throw new Error(`Obra não identificada para: ${row["Descrição"]}`);

                const description = row["Descrição"];
                if (!description) throw new Error("Descrição obrigatória");

                const amount = row["Valor"];
                const quantity = row["Quantidade"] || 1;
                const type = (row["Tipo (Capex/Opex)"] || "opex").toLowerCase();
                const category = row["Categoria"] || "";
                const dateStr = row["Data (AAAA-MM-DD)"];
                const notes = row["Notas"] || "";
                const assetNumber = row["Número do Ativo (Se Capex)"];

                let date = new Date();
                if (dateStr) {
                    const d = new Date(dateStr);
                    if (!isNaN(d.getTime())) date = d;
                }

                let assetId: string | undefined = undefined;
                if (type === 'capex' && assetNumber && assetsMap[String(assetNumber)]) {
                    assetId = assetsMap[String(assetNumber)];
                }

                await createExpenseMutation.mutateAsync({
                    projectId: String(projectId),
                    description: String(description),
                    amount: String(amount),
                    quantity: Number(quantity),
                    type: type as "capex" | "opex",
                    category: String(category),
                    date: date,
                    notes: String(notes),
                    assetId: assetId ? String(assetId) : undefined,
                } as any);
                successCount++;
            } catch (err) {
                console.error(err);
                errorCount++;
            }
        });

        await Promise.all(promises);
        if (successCount > 0) toast.success(`${successCount} despesas importadas!`);
        if (errorCount > 0) toast.error(`${errorCount} falhas na importação.`);
        
      } catch (error) {
        console.error("Erro na importação:", error);
        toast.error("Erro ao processar o arquivo.");
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-700">Budgets</h1>
        <div className="flex items-center gap-3">
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
        <Dialog open={openExpenseDialog} onOpenChange={handleOpenExpenseDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus size={20} />
              Nova Despesa
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] flex flex-col max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Registrar Nova Despesa</DialogTitle>
              <DialogDescription>
                Insira os detalhes da nova despesa. Para despesas Capex, selecione o ativo correspondente.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleExpenseSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto p-4 -mx-4 space-y-4 flex-1">
                <div className="space-y-2 p-4 border rounded-lg bg-slate-50">
                  <label className="text-sm font-medium">Importar da NF-e (Opcional)</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        value={nfeKey}
                        onChange={(e) => setNfeKey(e.target.value.replace(/\D/g, ''))}
                        placeholder="Digite os 44 dígitos da chave de acesso"
                        maxLength={44}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-10 w-10 text-muted-foreground hover:text-foreground"
                        onClick={() => setIsScanning(true)}
                        title="Escanear Código de Barras"
                      >
                        <QrCode className="h-5 w-5" />
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleFetchNfe}
                      disabled={nfeMutation.isPending}
                    >
                      {nfeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Obra</label>
                  <Select value={expenseFormData.projectId} onValueChange={(v) => setExpenseFormData({ ...expenseFormData, projectId: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma obra" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects?.map((p) => (
                        <SelectItem key={p.id} value={p.id.toString()}>
                          {p.name} {(p.status === 'concluido' || p.status === 'rejeitado') ? '(Bloqueado)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {expenseFormData.projectId && isExpenseBlocked && (
                  <div className="flex items-center gap-2 p-3 text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-md">
                    <AlertTriangle size={16} />
                    <span>Projeto concluído ou rejeitado. Despesas bloqueadas.</span>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium">Descrição</label>
                  <Input
                    required
                    value={expenseFormData.description}
                    onChange={(e) => setExpenseFormData({ ...expenseFormData, description: e.target.value })}
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
                      value={expenseFormData.amount}
                      onChange={(e) => setExpenseFormData({ ...expenseFormData, amount: e.target.value })}
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Quantidade</label>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      value={expenseFormData.quantity}
                      onChange={(e) => setExpenseFormData({ ...expenseFormData, quantity: e.target.value })}
                      placeholder="1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium">NCM</label>
                    <Input
                      value={expenseFormData.ncm}
                      onChange={(e) => setExpenseFormData({ ...expenseFormData, ncm: e.target.value })}
                      placeholder="0000.00.00"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">CFOP</label>
                    <Input
                      value={expenseFormData.cfop}
                      onChange={(e) => setExpenseFormData({ ...expenseFormData, cfop: e.target.value })}
                      placeholder="0000"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Unidade</label>
                    <Input
                      value={expenseFormData.unit}
                      onChange={(e) => setExpenseFormData({ ...expenseFormData, unit: e.target.value })}
                      placeholder="UN"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Tipo</label>
                  <Select value={expenseFormData.type} onValueChange={(v) => setExpenseFormData({ ...expenseFormData, type: v as "capex" | "opex" })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="capex">Capex (Capital)</SelectItem>
                      <SelectItem value="opex">Opex (Operacional)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {expenseFormData.type === "capex" && (
                  <div>
                    <label className="text-sm font-medium">Vincular ao Ativo</label>
                    <Select 
                      value={expenseFormData.assetId === null ? "none" : String(expenseFormData.assetId)} 
                      onValueChange={(v) => setExpenseFormData({ ...expenseFormData, assetId: v === "none" ? null : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um ativo (Opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                      {assetsForDialog?.map((asset) => (
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
                    value={expenseFormData.category}
                    onChange={(e) => setExpenseFormData({ ...expenseFormData, category: e.target.value })}
                    placeholder="Ex: Materiais"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Data</label>
                  <Input
                    type="date"
                    required
                    value={expenseFormData.date}
                    onChange={(e) => setExpenseFormData({ ...expenseFormData, date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Notas</label>
                  <Textarea
                    value={expenseFormData.notes}
                    onChange={(e) => setExpenseFormData({ ...expenseFormData, notes: e.target.value })}
                    placeholder="Observações adicionais..."
                    className="min-h-[120px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Número da Nota Fiscal</label>
                    <Input
                      value={expenseFormData.invoiceNumber}
                      onChange={(e) => setExpenseFormData({ ...expenseFormData, invoiceNumber: e.target.value })}
                      placeholder="Ex: 123456"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Arquivo (XML)</label>
                    <Input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.xml"
                      onChange={handleAttachmentChange}
                      className="cursor-pointer"
                    />
                  </div>
                </div>

                {expenseFormData.attachment && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-md flex items-center justify-between">
                      <div className="flex items-center gap-2 text-green-800 overflow-hidden">
                          <FileText size={18} className="shrink-0" />
                          <span className="text-sm font-medium truncate">{expenseFormData.attachment.name}</span>
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-green-700 hover:text-red-600 hover:bg-green-100" onClick={() => setExpenseFormData({...expenseFormData, attachment: null})}>
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
                <Button type="submit" className="w-full" disabled={isExpenseBlocked}>
                  Registrar Despesa
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

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
                      
                      const nextStep = steps[index + 1];
                      const approvalInfo = nextStep 
                        ? viewProject.approvalHistory?.slice().reverse().find((h: any) => h.status === nextStep.id)
                        : null;

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
                          <span className={`absolute -bottom-8 text-xs font-medium whitespace-nowrap ${isCurrent ? step.text : 'text-slate-500'}`}>
                            {step.label}
                          </span>
                          {approvalInfo && (
                        <div className="absolute top-24 flex flex-col items-center w-40 text-center z-20">
                            <span className="text-[10px] font-bold text-slate-700 leading-tight">{approvalInfo.user}</span>
                            <span className="text-[9px] text-slate-500 leading-tight">{new Date(approvalInfo.date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
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
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <h4 className="font-semibold text-sm text-gray-500">Localização</h4>
                    <p className="text-slate-700">{viewProject.location || "-"}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-500">Centro de Custo</h4>
                    <p className="text-slate-700">{viewProject.costCenter || "-"}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-500">Data de Início</h4>
                    <p className="text-slate-700">{new Date(viewProject.startDate).toLocaleDateString("pt-BR")}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-500">Previsão de Conclusão</h4>
                    <p className="text-slate-700">{viewProject.estimatedEndDate ? new Date(viewProject.estimatedEndDate).toLocaleDateString("pt-BR") : "-"}</p>
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
                <div className="absolute bottom-20 left-0 right-0 flex justify-center">
                    <p className="text-white bg-black/50 px-4 py-2 rounded">Aponte para o código de barras da NF-e</p>
                </div>
            </div>
        </div>
      )}
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="w-full md:w-72">
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="bg-white">
              <SelectValue placeholder="Filtrar por Obra" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Obras</SelectItem>
              {projects?.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-6 bg-white p-3 rounded-lg border shadow-sm">
           <div>
              <p className="text-xs text-gray-500 font-medium uppercase">Total Planejado</p>
              <p className="text-lg font-bold text-slate-700">{formatCurrency(totalPlanned)}</p>
           </div>
           <div className="w-px bg-gray-200"></div>
           <div>
              <p className="text-xs text-gray-500 font-medium uppercase">Total Realizado</p>
              <p className="text-lg font-bold text-slate-700">{formatCurrency(totalRealized)}</p>
           </div>
           <div className="w-px bg-gray-200"></div>
           <div>
              <p className="text-xs text-gray-500 font-medium uppercase">Disponível</p>
              <p className={`text-lg font-bold ${totalAvailable >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(totalAvailable)}</p>
           </div>
        </div>
      </div>

      <Card>
        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <Loader2 className="animate-spin" />
          </div>
        ) : filteredProjects && filteredProjects.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium text-gray-600">Obra</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Fluxo de Aprovação</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Status Aprovação</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Previsão de Conclusão</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Item Principal</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Status</th>
                  <th className="px-4 py-2 font-medium text-gray-600 text-right">Planejado</th>
                  <th className="px-4 py-2 font-medium text-gray-600 text-right">Realizado</th>
                  <th className="px-4 py-2 font-medium text-gray-600 text-right">Disponível</th>
                  <th className="px-4 py-2 font-medium text-gray-600 text-right">Progresso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredProjects.map((project) => (
                  <ProjectBudgetRow key={project.id} project={project} onDataLoaded={handleDataLoaded} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <p className="text-gray-500">Nenhum projeto encontrado.</p>
          </div>
        )}
      </Card>
    </div>
  );
}