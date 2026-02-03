import React, { useState, useEffect, useRef } from 'react';
import { db } from "@/lib/firebase";
import { collection, onSnapshot, updateDoc, doc } from "firebase/firestore";
import { useAuth } from '@/_core/hooks/useAuth';
import { getLoginUrl } from '@/const';
import { useLocation } from 'wouter';
import { Menu, X, LogOut, Home, FileText, DollarSign, Package, BarChart3, Landmark, Users, Bell, CheckCircle2, XCircle, ClipboardList, Eye, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, logout, isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pendingInventoryCount, setPendingInventoryCount] = useState(0);
  const [projects, setProjects] = useState<any[]>([]);
  const [viewProject, setViewProject] = useState<any | null>(null);
  
  // Garante a leitura do ID independente do formato do objeto user
  const userId = (user as any)?.id || (user as any)?.openId || (user as any)?.uid || (user as any)?.sub;

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "projects"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(data);
    });
    return () => unsubscribe();
  }, []);

  const roleMap: Record<string, string> = {
    engenharia: 'Engenharia',
    diretoria: 'Diretoria',
    aprovacao: 'Aprovação',
    classificacao: 'Classificação',
  };

  const userRole = (user as any)?.role;

  const pendingProjects = projects?.filter(p => {
    if (!userRole) return false;
    // Admin vê todas as pendências
    if (userRole === 'admin') return ['aguardando_classificacao', 'aguardando_engenharia', 'aguardando_diretoria'].includes(p.status);
    if (userRole === 'classificacao' && p.status === 'aguardando_classificacao') return true;
    if (userRole === 'engenharia' && p.status === 'aguardando_engenharia') return true;
    if (userRole === 'diretoria' && p.status === 'aguardando_diretoria') return true;
    return false;
  }) || [];

  useEffect(() => {
    if (pendingProjects.length > 0) {
      const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
      audio.play().catch(e => console.log("Audio play failed (autoplay policy)", e));
    }
  }, [pendingProjects.length]);

  const prevInventoryCountRef = useRef(0);

  useEffect(() => {
    if (!userId) return;

    const unsubscribe = onSnapshot(collection(db, "inventory_schedules"), (snapshot) => {
      const schedules = snapshot.docs.map(doc => doc.data());
      // Check if current user is in any pending schedule
      const mySchedules = schedules.filter((s: any) =>
        s.status === 'pending' && s.userIds && s.userIds.includes(userId)
      );
      
      const currentCount = mySchedules.length;

      if (currentCount > prevInventoryCountRef.current) {
           const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
           audio.play().catch(e => console.log("Audio play failed", e));
           toast.info(`Você tem ${currentCount} agendamentos de inventário pendentes.`);
      }
      
      prevInventoryCountRef.current = currentCount;
      setPendingInventoryCount(currentCount);
    });

    return () => unsubscribe();
  }, [userId]);

  const handleApprove = async (project: any) => {
    let nextStatus = '';
    if (project.status === 'aguardando_classificacao') nextStatus = 'aguardando_engenharia';
    else if (project.status === 'aguardando_engenharia') nextStatus = 'aguardando_diretoria';
    else if (project.status === 'aguardando_diretoria') nextStatus = 'aprovado';

    if (nextStatus) {
      const historyEntry = {
        status: nextStatus,
        date: new Date().toISOString(),
        user: user?.name || "Usuário",
        role: (user as any)?.role || "",
        notes: "Aprovado via Dashboard"
      };
      const newHistory = [...(project.approvalHistory || []), historyEntry];
      await updateDoc(doc(db, "projects", project.id), { status: nextStatus, approvalHistory: newHistory });
      toast.success(`Projeto ${project.name} aprovado!`);
    }
  };

  const handleReject = async (project: any) => {
    const historyEntry = {
      status: 'rejeitado',
      date: new Date().toISOString(),
      user: user?.name || "Usuário",
      role: (user as any)?.role || "",
      notes: "Rejeitado via Dashboard"
    };
    const newHistory = [...(project.approvalHistory || []), historyEntry];
    await updateDoc(doc(db, "projects", project.id), { status: 'rejeitado', approvalHistory: newHistory });
    toast.success(`Projeto ${project.name} rejeitado.`);
  };

  const totalNotifications = pendingProjects.length + pendingInventoryCount;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home, path: '/dashboard' },
    { id: 'projects', label: 'Obras', icon: FileText, path: '/projects' },
    { id: 'budgets', label: 'Budgets', icon: DollarSign, path: '/budgets' },
    { id: 'assets', label: 'Ativo em andamento', icon: Package, path: '/assets' },
    { id: 'inventory', label: 'Inventário de Ativos', icon: ClipboardList, path: '/inventory' },
    { id: 'reports', label: 'Relatórios', icon: FileText, path: '/reports' },
    { id: 'accounting', label: 'Estrutura Contábil', icon: Landmark, path: '/accounting' },
    { id: 'users', label: 'Usuários', icon: Users, path: '/users' },
  ];

  const allowedPages = (user as any)?.allowedPages;

  const visibleNavItems = navItems.filter(item => {
    const role = (user as any)?.role;
    if (role === 'diretoria' || role === 'admin') return true;
    // Se allowedPages não estiver definido (undefined/null), permite acesso (comportamento padrão ou legado)
    if (!allowedPages) return true;
    return allowedPages.includes(item.id);
  });

  const steps = [
    { id: 'aguardando_classificacao', label: 'Classificação', color: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-600', ring: 'ring-blue-200' },
    { id: 'aguardando_engenharia', label: 'Engenharia', color: 'bg-yellow-500', border: 'border-yellow-500', text: 'text-yellow-600', ring: 'ring-yellow-200' },
    { id: 'aguardando_diretoria', label: 'Diretoria', color: 'bg-orange-500', border: 'border-orange-500', text: 'text-orange-600', ring: 'ring-orange-200' },
    { id: 'aprovado', label: 'Aprovado', color: 'bg-green-500', border: 'border-green-500', text: 'text-green-600', ring: 'ring-green-200' }
  ];

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-[#0b543e] text-white transition-all duration-300 flex flex-col border-r border-[#a5b3c4]`}>
        {/* Logo */}
        <div className="p-4 border-b border-[#a5b3c4] flex items-center justify-center relative">
          {sidebarOpen && (
            <div className="flex flex-col items-center gap-2">
              <img src="/oba.svg" alt="Ícone Oba" className="w-32 h-32" />
              <h2 className="text-xl font-bold">Controle de Obras</h2>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`p-1 hover:bg-white/10 rounded ${sidebarOpen ? 'absolute right-4' : ''}`}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            const isInventory = item.path === '/inventory';
            return (
              <button
                key={item.path}
                onClick={() => setLocation(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                  isActive
                    ? 'bg-white text-[#F5821F] font-bold shadow-sm'
                    : 'text-white/90 hover:bg-white/10'
                }`}
              >
                <Icon size={20} className={isInventory && pendingInventoryCount > 0 ? "text-orange-400 animate-pulse" : ""} />
                {sidebarOpen && <span className={isInventory && pendingInventoryCount > 0 ? "text-orange-400 font-bold animate-pulse" : ""}>{item.label}</span>}
                {sidebarOpen && isInventory && pendingInventoryCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                    {pendingInventoryCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden text-slate-700">
        <Dialog open={!!viewProject} onOpenChange={(open) => !open && setViewProject(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Detalhes do Projeto</DialogTitle>
            </DialogHeader>
            {viewProject && (
              <div className="space-y-4">
                <div className="py-4 mb-20">
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold text-sm text-gray-500">Capex</h4>
                    <p className="text-slate-700 font-mono">{formatCurrency(Number(viewProject.plannedCapex || 0))}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-500">Opex</h4>
                    <p className="text-slate-700 font-mono">{formatCurrency(Number(viewProject.plannedOpex || 0))}</p>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-gray-500">Valor Planejado</h4>
                  <p className="text-slate-700 font-mono">{formatCurrency(Number(viewProject.plannedValue || 0))}</p>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
        {/* Header */}
        <header className="bg-white border-b border-border px-6 py-4 shadow-sm flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-700">Sistema de Gestão de Obras</h1>
          <div className="flex items-center gap-4">
            
            {/* Notifications */}
            <Dialog>
              <DialogTrigger asChild>
                <button className="relative p-2 text-slate-600 hover:bg-slate-100 rounded-full transition group">
                  <Bell size={20} className={totalNotifications > 0 ? "text-orange-600 animate-pulse" : ""} />
                  {totalNotifications > 0 && (
                    <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full animate-pulse">
                      {totalNotifications}
                    </span>
                  )}
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Notificações ({totalNotifications})</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  {/* Seção de Inventário */}
                  {pendingInventoryCount > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-orange-800 font-semibold mb-2">
                        <ClipboardList size={18} />
                        <span>Inventário Pendente</span>
                      </div>
                      <p className="text-sm text-orange-700 mb-3">
                        Você foi designado para realizar a contagem de <strong>{pendingInventoryCount}</strong> agendamento(s).
                      </p>
                      <div className="flex justify-end">
                        <Button 
                          size="sm" 
                          className="bg-orange-600 hover:bg-orange-700 text-white w-full"
                          onClick={() => setLocation('/inventory')}
                        >
                          Ir para Inventário
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Seção de Projetos */}
                  {pendingProjects.length > 0 ? (
                    <>
                      {pendingProjects.length > 0 && <h4 className="text-sm font-medium text-gray-500 mt-2">Aprovações de Projetos</h4>}
                      {pendingProjects.map(project => (
                        <div key={project.id} className="p-4 border rounded-lg bg-slate-50">
                          <h3 className="font-semibold text-slate-800">{project.name}</h3>
                          <p className="text-sm text-slate-600 mb-3">{project.description || "Sem descrição"}</p>
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200" onClick={() => handleReject(project)}>
                              <XCircle size={16} className="mr-1" /> Rejeitar
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setViewProject(project)}>
                              <Eye size={16} className="mr-1" /> Visualizar
                            </Button>
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => handleApprove(project)}>
                              <CheckCircle2 size={16} className="mr-1" /> Aprovar
                            </Button>
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    null
                  )}

                  {totalNotifications === 0 && (
                    <p className="text-center text-slate-500 py-4">Nenhuma notificação pendente.</p>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <div className="text-right">
              <p className="text-sm font-semibold text-slate-700">{user?.name || user?.email}</p>
              <p className="text-xs text-slate-500">Perfil: {(user as any)?.role ? (roleMap[(user as any).role] || (user as any).role) : 'Usuário'}</p>
            </div>
            <button
              onClick={() => {
                localStorage.removeItem("obras_token");
                localStorage.removeItem("obras_user");
                logout();
                window.location.href = "/login";
              }}
              className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition text-sm text-slate-700"
            >
              <LogOut size={18} />
              <span>Sair</span>
            </button>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto bg-gray-50">
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
