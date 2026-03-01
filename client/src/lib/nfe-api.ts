export interface NfeProduct {
  code: string;
  description: string;
  ncm: string;
  cest: string;
  cfop: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  cst: string;
  orig: string;
}

export interface NfeData {
  description: string;
  amount: number;
  date: string;
  notes: string;
  products: NfeProduct[];
}

export const nfeApi = {
  consultar: async (chave: string): Promise<NfeData> => {
    try {
      // Chama a rota do backend que executa o Puppeteer
      const response = await fetch('/api/nfe-scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chave })
      });

      if (!response.ok) throw new Error('Falha na comunicação com o serviço de consulta.');
      return await response.json();
    } catch (error) {
      console.error("Erro na consulta NF-e:", error);
      throw error;
    }
  }
};