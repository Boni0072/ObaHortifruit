import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from "firebase/firestore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Pencil, Plus, Trash2, Shield, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

// Definição dos perfis solicitados
export const ROLES = [
  { value: "engenharia", label: "Engenharia" },
  { value: "diretoria", label: "Diretoria" },
  { value: "aprovacao", label: "Aprovação" },
  { value: "classificacao", label: "Classificação" },
];

// Páginas disponíveis para controle de acesso
export const AVAILABLE_PAGES = [
  { id: "dashboard", label: "Dashboard" },
  { id: "projects", label: "Obras" },
  { id: "budgets", label: "Budgets" },
  { id: "assets", label: "Ativo em andamento" },
  { id: "asset-movements", label: "Movimentações" },
  { id: "asset-depreciation", label: "Depreciação" },
  { id: "inventory", label: "Inventário de Ativos" },
  { id: "reports", label: "Relatórios" },
  { id: "accounting", label: "Estrutura Contábil" },
  { id: "users", label: "Usuários" },
];

export default function UserPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(data);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showSignatureCanvas, setShowSignatureCanvas] = useState(true);
  
  // Estado do formulário
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "", // Adicionado campo de senha
    role: "engenharia",
    allowedPages: [] as string[],
    signature: "",
  });

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      password: "", // Resetar campo de senha
      role: "engenharia",
      allowedPages: [],
      signature: "",
    });
    setEditingId(null);
    setShowSignatureCanvas(true);
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) resetForm();
  };

  const handleEdit = (user: any) => {
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      allowedPages: user.allowedPages || [],
      password: "", // Não preencher a senha ao editar por segurança
      signature: user.signature || "",
    });
    setEditingId(user.id);
    setOpen(true);
    setShowSignatureCanvas(!user.signature);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingId) {
        const updateData: any = {
          ...formData,
        };
        // Remove a senha se estiver vazia para não salvar string vazia
        if (!updateData.password) delete updateData.password;
        
        await updateDoc(doc(db, "users", editingId), updateData);
        toast.success("Usuário atualizado com sucesso!");
      } else {
        // Criação direta no Firestore. 
        // Nota: Isso cria o registro visual, mas não cria a conta de autenticação (Auth) 
        // se não houver backend integrado. Para fins de gestão visual, funciona.
        await addDoc(collection(db, "users"), {
          ...formData,
          createdAt: new Date().toISOString()
        });
        toast.success("Usuário criado com sucesso!");
      }
      setOpen(false);
      resetForm();
    } catch (error) {
      toast.error(editingId ? "Erro ao atualizar usuário" : "Erro ao criar usuário");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este usuário?")) return;
    try {
      await deleteDoc(doc(db, "users", id));
      toast.success("Usuário removido com sucesso!");
    } catch (error) {
      toast.error("Erro ao remover usuário");
    }
  };

  const togglePagePermission = (pageId: string) => {
    setFormData(prev => {
      const pages = prev.allowedPages.includes(pageId)
        ? prev.allowedPages.filter(p => p !== pageId)
        : [...prev.allowedPages, pageId];
      return { ...prev, allowedPages: pages };
    });
  };

  // Lógica para o Canvas de Assinatura
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => {
    let clientX, clientY;
    if ('touches' in e) {
      const touch = e.touches[0];
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      const mouse = e as React.MouseEvent<HTMLCanvasElement>;
      clientX = mouse.clientX;
      clientY = mouse.clientY;
    }
    const rect = canvas.getBoundingClientRect();
    return {
      offsetX: clientX - rect.left,
      offsetY: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsDrawing(true);
    const { offsetX, offsetY } = getCoordinates(e, canvas);
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { offsetX, offsetY } = getCoordinates(e, canvas);
    ctx.lineTo(offsetX, offsetY);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
        setFormData(prev => ({ ...prev, signature: canvas.toDataURL() }));
    }
  };

  const clearSignature = () => {
      setFormData(prev => ({ ...prev, signature: "" }));
      setShowSignatureCanvas(true);
      setTimeout(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext("2d");
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }
      }, 0);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-700">Gerenciamento de Usuários</h1>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus size={20} />
              Novo Usuário
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Usuário" : "Novo Usuário"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Nome</Label>
                <Input
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nome completo"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Email</Label>
                <Input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@empresa.com"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Senha</Label>
                <Input
                  type="text" // Alterado para 'text' para exibir a senha. ATENÇÃO: Isso não é uma prática de segurança recomendada.
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Deixe em branco para manter a senha atual"
                  minLength={6}
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">Assinatura Digital</Label>
                { !showSignatureCanvas && formData.signature ? (
                  <div className="border rounded-md p-4 flex flex-col items-center gap-4 bg-slate-50">
                    {formData.signature.startsWith('data:image') ? (
                      <img src={formData.signature} alt="Assinatura" className="max-h-24 border bg-white rounded" />
                    ) : (
                      <div className="text-lg font-script p-4 border bg-white w-full text-center">{formData.signature}</div>
                    )}
                    <Button type="button" variant="outline" size="sm" onClick={clearSignature} className="text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remover / Nova Assinatura
                    </Button>
                  </div>
                ) : (
                  <div className="border rounded-md bg-white overflow-hidden shadow-sm">
                    <canvas
                      ref={canvasRef}
                      width={450}
                      height={150}
                      className="w-full h-[150px] cursor-crosshair touch-none bg-white"
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                    />
                    <div className="bg-slate-50 border-t p-2 flex justify-between items-center text-xs text-muted-foreground">
                      <span>Desenhe sua assinatura acima</span>
                      <Button type="button" variant="ghost" size="sm" onClick={clearSignature}>
                        Limpar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <Label className="text-sm font-medium">Perfil</Label>
                <Select 
                  value={formData.role} 
                  onValueChange={(v) => setFormData({ ...formData, role: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium mb-2 block">Acesso às Páginas</Label>
                <div className="grid grid-cols-2 gap-3 border rounded-md p-4 bg-slate-50">
                  {AVAILABLE_PAGES.map((page) => (
                    <div key={page.id} className="flex items-center space-x-2">
                      <Checkbox 
                        id={`page-${page.id}`}
                        checked={formData.allowedPages.includes(page.id)}
                        onCheckedChange={() => togglePagePermission(page.id)}
                      />
                      <label 
                        htmlFor={`page-${page.id}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {page.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooter>
                <Button type="submit">
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Usuários Cadastrados</h2>
        </div>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Assinatura</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Acesso</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users?.map((user: any) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {user.signature && user.signature.startsWith('data:image') ? (
                      <img src={user.signature} alt="Assinatura" className="h-8 border bg-white rounded" />
                    ) : (
                      user.signature || "-"
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      <Shield size={12} />
                      {ROLES.find(r => r.value === user.role)?.label || user.role}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.allowedPages?.map((pageId: string) => {
                        const page = AVAILABLE_PAGES.find(p => p.id === pageId);
                        return page ? (
                          <span key={pageId} className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 border">
                            {page.label}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEdit(user)}
                      >
                        <Pencil size={16} className="text-blue-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleDelete(user.id)}
                      >
                        <Trash2 size={16} className="text-red-600" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!users || users.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nenhum usuário encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
