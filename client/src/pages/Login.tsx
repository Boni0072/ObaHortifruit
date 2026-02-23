import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { collection, query, where, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, LogIn, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Estados para o fluxo de Setup (Senha e Assinatura)
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [setupEmail, setSetupEmail] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupSignature, setSetupSignature] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("setup") === "true" && params.get("email")) {
      setSetupEmail(params.get("email") || "");
      setIsSetupOpen(true);
    }
  }, []);

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => {
    let clientX, clientY;
    if ('touches' in e) {
      const touch = (e as React.TouchEvent<HTMLCanvasElement>).touches[0];
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
        setSetupSignature(canvas.toDataURL());
    }
  };

  const clearSignature = () => {
      setSetupSignature("");
      const canvas = canvasRef.current;
      if (canvas) {
          const ctx = canvas.getContext("2d");
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
  };

  // Helper para criar token JWT fake compatível com o backend em desenvolvimento
  const createMockToken = (user: { id: string; email: string; name: string }) => {
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payloadObj = {
      user_id: user.id,
      email: user.email,
      name: user.name,
      sub: user.id,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) // 24h
    };
    const payload = btoa(unescape(encodeURIComponent(JSON.stringify(payloadObj))));
    const signature = "mock-signature";
    return `${header}.${payload}.${signature}`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validação direta no Firestore
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", email), where("password", "==", password));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        
        // Armazena dados da sessão (Simulação de Auth)
        // Nota: Isso deve ser ajustado para integrar com o hook useAuth existente se necessário
        const token = createMockToken({
          id: userDoc.id,
          email: userData.email,
          name: userData.name
        });
        localStorage.setItem("obras_token", token);
        localStorage.setItem("obras_user", JSON.stringify({ 
          id: userDoc.id,
          name: userData.name,
          email: userData.email,
          role: userData.role,
          ...userData 
        }));
        
        console.log("Login realizado com sucesso. Token gerado:", token);
        toast.success(`Bem-vindo, ${userData.name}!`);
        
        // Redireciona para o dashboard
        window.location.href = "/dashboard";
      } else if (email === "admin@oba.com" && password === "123456") {
        // Backdoor para primeiro acesso/desenvolvimento
        const token = createMockToken({
          id: "admin-dev",
          email: "admin@oba.com",
          name: "Administrador (Dev)"
        });
        localStorage.setItem("obras_token", token);
        localStorage.setItem("obras_user", JSON.stringify({ 
          id: "admin-dev",
          name: "Administrador (Dev)",
          email: "admin@oba.com",
          role: "diretoria",
          allowedPages: ["dashboard", "projects", "assets", "asset-movements", "asset-depreciation", "budgets", "inventory", "reports", "accounting", "users"]
        }));
        
        console.log("Login Admin (Dev) realizado. Token:", token);
        toast.success("Login de administrador (Modo Dev)!");
        window.location.href = "/dashboard";
      } else {
        toast.error("Email ou senha incorretos.");
      }
    } catch (error) {
      console.error("Erro no login:", error);
      toast.error("Erro ao conectar com o servidor.");
    } finally {
      setLoading(false);
    }
  };

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupPassword || setupPassword.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (!setupSignature) {
      toast.error("A assinatura é obrigatória.");
      return;
    }

    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", setupEmail));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        toast.error("Usuário não encontrado.");
        return;
      }

      const userDoc = querySnapshot.docs[0];
      await updateDoc(doc(db, "users", userDoc.id), {
        password: setupPassword,
        signature: setupSignature
      });

      toast.success("Senha e assinatura cadastradas com sucesso! Faça login para continuar.");
      setIsSetupOpen(false);
      window.history.replaceState({}, document.title, "/login");
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar dados.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-blue-600/20 blur-[100px]" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] rounded-full bg-orange-500/20 blur-[100px]" />
      </div>

      <Card className="w-full max-w-md z-10 border-slate-800 bg-slate-950/50 backdrop-blur-xl text-white shadow-2xl">
        <CardHeader className="space-y-4 flex flex-col items-center text-center pb-2">
          <div className="relative w-28 h-28 mb-2">
            <div className="absolute inset-0 bg-orange-500/30 rounded-full blur-xl animate-pulse" />
            <img 
              src="/oba.svg" 
              alt="Logo Oba" 
              className="w-full h-full relative z-10 drop-shadow-lg animate-[bounce_3s_infinite]"
            />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold tracking-tight">Acesso ao Sistema</CardTitle>
            <CardDescription className="text-slate-400">
              Entre com suas credenciais para continuar
            </CardDescription>
          </div>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="seu@email.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-slate-900/50 border-slate-700 focus:border-orange-500 transition-colors text-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input 
                id="password" 
                type="password" 
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-slate-900/50 border-slate-700 focus:border-orange-500 transition-colors text-white"
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              type="submit" 
              className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold py-6 transition-all duration-300 shadow-lg hover:shadow-orange-500/25"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  Entrar
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Dialog open={isSetupOpen} onOpenChange={setIsSetupOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Configuração de Conta</DialogTitle>
            <DialogDescription>
              Defina sua senha de acesso e desenhe sua assinatura digital para aprovações.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSetupSubmit} className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input value={setupEmail} disabled className="bg-slate-100" />
            </div>
            <div>
              <Label>Nova Senha</Label>
              <Input 
                type="password" 
                value={setupPassword} 
                onChange={(e) => setSetupPassword(e.target.value)} 
                placeholder="Mínimo 6 caracteres"
                required
                minLength={6}
              />
            </div>
            <div>
              <Label className="mb-2 block">Assinatura Digital</Label>
              <div className="border rounded-md bg-white overflow-hidden shadow-sm relative">
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
                  <Button type="button" variant="ghost" size="sm" onClick={clearSignature} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                    <Trash2 className="w-3 h-3 mr-1" /> Limpar
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" className="w-full">Salvar e Continuar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}