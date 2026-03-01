import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { 
  Search, Upload, Key, FileText, FileCode, CheckCircle, 
  AlertTriangle, Loader2, X, Download, Info, Rocket, FileDigit
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as XLSX from "xlsx";

export default function NfeConsultationPage() {
  const [activeTab, setActiveTab] = useState<'chave' | 'xml'>('chave');
  const [nfeKey, setNfeKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resultData, setResultData] = useState<any | null>(null);
  const [showModal, setShowModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mutação para consulta via chave (Scraper)
  const nfeMutation = trpc.nfe.consultar.useMutation({
    onSuccess: (data) => {
      setResultData(data);
      setShowModal(true);
      toast.success("Consulta realizada com sucesso!");
    },
    onError: (error) => {
      toast.error(`Erro na consulta: ${error.message}`);
    }
  });

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nfeKey.length !== 44) {
      toast.error("A chave de acesso deve ter 44 dígitos.");
      return;
    }
    setIsLoading(true);
    nfeMutation.mutate({ chave: nfeKey }, {
      onSettled: () => setIsLoading(false)
    });
  };

  // Processamento de XML Local (Client-side)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.xml')) {
      toast.error("Por favor, selecione um arquivo XML válido.");
      return;
    }

    setIsLoading(true);
    try {
      const text = await file.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, "text/xml");

      // Helper para extrair valor de tag
      const get = (tag: string, parent: Element | Document = xmlDoc) => {
        const el = parent.getElementsByTagName(tag)[0];
        return el ? el.textContent?.trim() || "" : "";
      };

      const emitente = get("xNome", xmlDoc.getElementsByTagName("emit")[0]);
      const dataEmissao = get("dhEmi") || get("dEmi");
      const valorTotal = parseFloat(get("vNF") || "0");
      const infCpl = get("infCpl");

      const products: any[] = [];
      const dets = xmlDoc.getElementsByTagName("det");
      
      for (let i = 0; i < dets.length; i++) {
          const prod = dets[i].getElementsByTagName("prod")[0];
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
                  totalPrice: parseFloat(get("vProd", prod) || "0")
              });
          }
      }

      const data = {
        description: emitente || "Nota Fiscal Importada",
        amount: valorTotal,
        date: dataEmissao,
        notes: infCpl,
        products
      };

      setResultData(data);
      setShowModal(true);
      toast.success("XML processado com sucesso!");
    } catch (error) {
      console.error(error);
      toast.error("Falha ao ler o arquivo XML.");
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const downloadExcel = () => {
    if (!resultData || !resultData.products) return;
    
    const ws = XLSX.utils.json_to_sheet(resultData.products.map((p: any) => ({
      "Código": p.code,
      "Descrição": p.description,
      "NCM": p.ncm,
      "CFOP": p.cfop,
      "Unidade": p.unit,
      "Quantidade": p.quantity,
      "Valor Unit.": p.unitPrice,
      "Valor Total": p.totalPrice
    })));
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Itens da Nota");
    XLSX.writeFile(wb, `NFe_Itens_${new Date().getTime()}.xlsx`);
  };

  return (
    <div className="nfe-page-container min-h-screen bg-slate-50 font-sans">
      <style>{`
        .nfe-page-container {
          background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
        }
        
        .banner-area {
          padding: 80px 0 60px;
          background: linear-gradient(135deg, #4ac4f3 0%, #2980b9 100%);
          color: white;
          position: relative;
          overflow: hidden;
          border-radius: 0 0 50px 50px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        
        .hero-title {
          font-size: 2.5rem;
          font-weight: 800;
          margin-bottom: 1rem;
          text-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .danfe-generator-container {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.15);
          border: 1px solid rgba(255,255,255,0.5);
          overflow: hidden;
          max-width: 900px;
          margin: -80px auto 40px;
          position: relative;
          z-index: 10;
        }

        .method-tabs {
          display: flex;
          background: #f8f9fa;
          border-bottom: 1px solid #e9ecef;
        }

        .tab-button {
          flex: 1;
          padding: 20px;
          border: none;
          background: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          transition: all 0.3s ease;
          position: relative;
        }

        .tab-button.active {
          background: white;
          color: #2980b9;
        }

        .tab-button.active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 3px;
          background: #2980b9;
        }

        .tab-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #e9ecef;
          color: #6c757d;
          transition: all 0.3s ease;
        }

        .tab-button.active .tab-icon {
          background: linear-gradient(135deg, #4ac4f3, #2980b9);
          color: white;
          box-shadow: 0 4px 10px rgba(41, 128, 185, 0.3);
        }

        .tab-content-area {
          padding: 40px;
        }

        .input-premium {
          width: 100%;
          padding: 18px 20px 18px 50px;
          border: 2px solid #e9ecef;
          border-radius: 12px;
          font-size: 16px;
          font-family: monospace;
          transition: all 0.3s ease;
          background: #f8f9fa;
        }

        .input-premium:focus {
          border-color: #4ac4f3;
          background: white;
          box-shadow: 0 0 0 4px rgba(74, 196, 243, 0.1);
          outline: none;
        }

        .input-icon-absolute {
          position: absolute;
          left: 18px;
          top: 50%;
          transform: translateY(-50%);
          color: #adb5bd;
        }

        .btn-action {
          background: linear-gradient(135deg, #4ac4f3 0%, #2980b9 100%);
          color: white;
          border: none;
          padding: 16px 32px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(41, 128, 185, 0.3);
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .btn-action:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(41, 128, 185, 0.4);
        }

        .btn-action:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none;
        }

        .upload-zone {
          border: 2px dashed #cbd5e1;
          border-radius: 15px;
          padding: 40px;
          text-align: center;
          cursor: pointer;
          transition: all 0.3s ease;
          background: #f8f9fa;
        }

        .upload-zone:hover {
          border-color: #4ac4f3;
          background: #f0f9ff;
        }

        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.5);
          backdrop-filter: blur(5px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .modal-premium {
          background: white;
          border-radius: 20px;
          width: 100%;
          max-width: 800px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          animation: modalSlideIn 0.3s ease-out;
        }

        .modal-header-premium {
          background: linear-gradient(135deg, #4ac4f3 0%, #2980b9 100%);
          padding: 30px;
          color: white;
          text-align: center;
          position: relative;
        }

        .info-card {
          background: white;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          border: 1px solid #e2e8f0;
          margin-bottom: 20px;
        }

        @keyframes modalSlideIn {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      {/* Banner Area */}
      <div className="banner-area">
        <div className="container mx-auto px-4 text-center">
          <h2 className="hero-title flex items-center justify-center gap-3">
            <FileText className="w-10 h-10" />
            Consulta de Nota Fiscal
          </h2>
          <p className="text-lg opacity-90 max-w-2xl mx-auto mb-12">
            Consulte, visualize e baixe suas notas fiscais de forma rápida e segura.
            Suporte para chave de acesso e arquivos XML.
          </p>
        </div>
      </div>

      {/* Main Container */}
      <div className="container mx-auto px-4">
        <div className="danfe-generator-container">
          {/* Tabs */}
          <div className="method-tabs">
            <button 
              className={`tab-button ${activeTab === 'chave' ? 'active' : ''}`}
              onClick={() => setActiveTab('chave')}
            >
              <div className="tab-icon">
                <Key size={20} />
              </div>
              <div className="text-left">
                <div className="font-bold text-slate-700">Chave de Acesso</div>
                <div className="text-xs text-slate-500">Método recomendado</div>
              </div>
            </button>
            
            <button 
              className={`tab-button ${activeTab === 'xml' ? 'active' : ''}`}
              onClick={() => setActiveTab('xml')}
            >
              <div className="tab-icon">
                <Upload size={20} />
              </div>
              <div className="text-left">
                <div className="font-bold text-slate-700">Upload XML</div>
                <div className="text-xs text-slate-500">Arraste seu arquivo</div>
              </div>
            </button>
          </div>

          {/* Content */}
          <div className="tab-content-area">
            {activeTab === 'chave' ? (
              <form onSubmit={handleSearch} className="space-y-6">
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg mb-6">
                  <div className="flex items-center gap-3">
                    <Info className="text-blue-500" />
                    <p className="text-sm text-blue-800">
                      Digite os <strong>44 dígitos</strong> da chave de acesso localizada no canto superior direito da sua DANFE.
                    </p>
                  </div>
                </div>

                <div className="relative">
                  <div className="input-icon-absolute">
                    <Key size={20} />
                  </div>
                  <input
                    type="text"
                    value={nfeKey}
                    onChange={(e) => setNfeKey(e.target.value.replace(/\D/g, ''))}
                    placeholder="0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000"
                    maxLength={44}
                    className="input-premium"
                  />
                  <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-xs font-bold text-slate-400">
                    {nfeKey.length}/44
                  </div>
                </div>

                <div className="flex justify-center">
                  <button 
                    type="submit" 
                    className="btn-action"
                    disabled={isLoading || nfeKey.length !== 44}
                  >
                    {isLoading ? <Loader2 className="animate-spin" /> : <Search />}
                    Consultar Nota
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-6">
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg mb-6">
                  <div className="flex items-center gap-3">
                    <Info className="text-blue-500" />
                    <p className="text-sm text-blue-800">
                      Selecione o arquivo XML da nota fiscal para visualizar os dados instantaneamente.
                    </p>
                  </div>
                </div>

                <div 
                  className="upload-zone"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 mb-2">
                      <Upload size={32} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-700">Clique para selecionar</h3>
                      <p className="text-slate-500">ou arraste o arquivo XML aqui</p>
                    </div>
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    className="hidden" 
                    accept=".xml"
                    onChange={handleFileUpload}
                  />
                </div>

                {isLoading && (
                  <div className="flex justify-center text-blue-600 font-medium items-center gap-2">
                    <Loader2 className="animate-spin" /> Processando arquivo...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-20">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 text-center hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center text-green-600 mx-auto mb-4">
              <CheckCircle size={24} />
            </div>
            <h3 className="font-bold text-slate-700 mb-2">Dados Completos</h3>
            <p className="text-sm text-slate-500">Visualização detalhada de emitente, produtos e valores.</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 text-center hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600 mx-auto mb-4">
              <Rocket size={24} />
            </div>
            <h3 className="font-bold text-slate-700 mb-2">Processamento Rápido</h3>
            <p className="text-sm text-slate-500">Consulta direta na SEFAZ ou leitura instantânea de XML.</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 text-center hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600 mx-auto mb-4">
              <FileDigit size={24} />
            </div>
            <h3 className="font-bold text-slate-700 mb-2">Exportação</h3>
            <p className="text-sm text-slate-500">Exporte os dados dos itens para Excel facilmente.</p>
          </div>
        </div>
      </div>

      {/* Result Modal */}
      {showModal && resultData && (
        <div className="modal-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) setShowModal(false);
        }}>
          <div className="modal-premium">
            <div className="modal-header-premium">
              <button 
                onClick={() => setShowModal(false)}
                className="absolute top-4 right-4 text-white/80 hover:text-white hover:bg-white/20 rounded-full p-2 transition-all"
              >
                <X size={24} />
              </button>
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                <CheckCircle size={32} className="text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-1">Consulta Realizada!</h3>
              <p className="opacity-90">Confira os dados da nota fiscal abaixo</p>
            </div>

            <div className="p-8 bg-slate-50">
              {/* Header Info */}
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div className="info-card">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Emitente</span>
                  <h4 className="text-lg font-bold text-slate-700 mt-1">{resultData.description}</h4>
                </div>
                <div className="info-card">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Valor Total</span>
                  <h4 className="text-lg font-bold text-green-600 mt-1">
                    {resultData.amount?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </h4>
                </div>
              </div>

              {/* Details */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
                <div className="bg-slate-100 px-6 py-3 border-b border-slate-200 flex justify-between items-center">
                  <h4 className="font-bold text-slate-700 flex items-center gap-2">
                    <FileText size={18} className="text-blue-500" />
                    Itens da Nota ({resultData.products?.length || 0})
                  </h4>
                  <Button variant="outline" size="sm" onClick={downloadExcel} className="h-8 text-xs gap-2">
                    <Download size={14} /> Exportar Excel
                  </Button>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-medium sticky top-0">
                      <tr>
                        <th className="px-6 py-3">Código</th>
                        <th className="px-6 py-3">Descrição</th>
                        <th className="px-6 py-3">CFOP</th>
                        <th className="px-6 py-3 text-right">Qtd</th>
                        <th className="px-6 py-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {resultData.products?.map((prod: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-6 py-3 font-mono text-slate-500">{prod.code}</td>
                          <td className="px-6 py-3 text-slate-700">{prod.description}</td>
                          <td className="px-6 py-3 text-slate-600 text-xs">{prod.cfop}</td>
                          <td className="px-6 py-3 text-right text-slate-600">
                            {prod.quantity} <span className="text-xs text-slate-400">{prod.unit}</span>
                          </td>
                          <td className="px-6 py-3 text-right font-medium text-slate-700">
                            {prod.totalPrice?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-4 justify-end">
                <Button variant="outline" onClick={() => setShowModal(false)}>
                  Fechar
                </Button>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                  <Download size={18} />
                  Baixar XML (Simulado)
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}