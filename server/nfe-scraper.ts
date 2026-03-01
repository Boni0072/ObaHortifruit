import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';

puppeteer.use(StealthPlugin());

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

let globalBrowser: any = null;
let globalPage: any = null;

export async function consultarNfe(chave: string): Promise<NfeData> {
  if (!globalBrowser || !globalBrowser.isConnected()) {
    try {
      // Tenta conectar a uma instância já aberta na porta 9222 (mesmo se o servidor reiniciou)
      globalBrowser = await puppeteer.connect({
        browserURL: 'http://127.0.0.1:9222',
        defaultViewport: null,
      });
      console.log('[Scraper] Reconectado ao navegador existente.');
    } catch (e) {
      console.log('[Scraper] Iniciando novo navegador...');
      // Se não encontrar, abre um novo com a porta 9222 aberta para futuras conexões
      globalBrowser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        userDataDir: './puppeteer_data', // Salva a sessão em uma pasta local
        channel: 'chrome', // Usa o Google Chrome instalado
        ignoreDefaultArgs: ['--enable-automation'], // Remove a barra "Chrome controlado por software de teste"
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox', 
          '--start-maximized', 
          '--remote-debugging-port=9222',
          '--disable-blink-features=AutomationControlled' // Ajuda a evitar detecção anti-bot
        ]
      });
    }
  }

  // Reutiliza a página se ela existir e estiver aberta, senão cria uma nova.
  if (!globalPage || globalPage.isClosed()) {
    console.log('[Scraper] Abrindo nova guia...');
    globalPage = await globalBrowser.newPage();
  } else {
    console.log('[Scraper] Reutilizando guia existente.');
  }
  const page = globalPage;
  // Traz a página para frente para garantir que o usuário a veja.
  await page.bringToFront();

  try {
    // Define um User-Agent comum para evitar bloqueios ou loops de redirecionamento
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    // Configura diretório de download temporário
    const downloadPath = path.resolve(process.cwd(), 'temp_downloads', chave);
    if (fs.existsSync(downloadPath)) {
        fs.rmSync(downloadPath, { recursive: true, force: true });
    }
    fs.mkdirSync(downloadPath, { recursive: true });

    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadPath,
    });

    console.log(`[Scraper] Iniciando consulta para chave: ${chave}`);
    // Usa o site consultadanfe.com conforme solicitado para baixar o XML
    await page.goto('https://consultadanfe.com/', {
      waitUntil: 'networkidle2'
    });

    // Tenta identificar o campo de chave (seletores genéricos para robustez)
    const inputSelector = 'input[name*="chave"], input[placeholder*="chave"], input[id*="chave"]';
    await page.waitForSelector(inputSelector);
    
    // Limpa e digita a chave
    await page.evaluate((sel: string) => { 
        const el = document.querySelector(sel) as HTMLInputElement;
        if(el) el.value = ''; 
    }, inputSelector);
    await page.type(inputSelector, chave, { delay: 50 });

    // Clica no botão de buscar/gerar
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
        const btn = buttons.find(b => {
            const txt = (b as HTMLElement).innerText || (b as HTMLInputElement).value || "";
            return txt.toLowerCase().match(/buscar|gerar|consultar/);
        });
        if (btn) (btn as HTMLElement).click();
    });

    console.log('[Scraper] Aguardando processamento...');

    // Aguarda aparecer o botão de baixar XML ou erro
    // Timeout longo (60s) para permitir que o usuário resolva captcha se aparecer
    try {
        await page.waitForFunction(() => {
            const text = document.body.innerText;
            return text.includes("Baixar XML") || text.includes("Download XML") || text.includes("inválida") || text.includes("não encontrada");
        }, { timeout: 60000 });
    } catch (e) {
        throw new Error("Tempo limite excedido. Verifique se há captcha ou se o site mudou.");
    }

    // Verifica erros na página
    const errorMsg = await page.evaluate(() => {
        const text = document.body.innerText;
        if (text.includes("Chave de Acesso inválida") || text.includes("Nota Fiscal não encontrada")) {
            return "Chave de acesso inválida ou nota não encontrada.";
        }
        return null;
    });
    if (errorMsg) throw new Error(errorMsg);

    console.log('[Scraper] Tentando baixar XML...');
    
    // Limpa arquivos anteriores na pasta temporária para garantir que pegamos o novo
    if (fs.existsSync(downloadPath)) {
        const files = fs.readdirSync(downloadPath);
        for (const file of files) {
             try { fs.unlinkSync(path.join(downloadPath, file)); } catch(e) {}
        }
    }

    // Clica no botão de baixar XML
    await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a, button'));
        const xmlBtn = links.find(el => (el.innerText || '').match(/Baixar XML|Download XML/i));
        if (xmlBtn) (xmlBtn as HTMLElement).click();
    });

    let xmlContent = "";

    // Aguarda o arquivo XML aparecer na pasta (Timeout 10s)
    await new Promise<void>((resolve) => {
        let checks = 0;
        const checkInterval = setInterval(() => {
            checks++;
            if (fs.existsSync(downloadPath)) {
                const files = fs.readdirSync(downloadPath);
                const xmlFile = files.find(f => f.toLowerCase().endsWith('.xml'));
                if (xmlFile) {
                    clearInterval(checkInterval);
                    xmlContent = fs.readFileSync(path.join(downloadPath, xmlFile), 'utf-8');
                    resolve();
                    return;
                }
            }
            if (checks > 60) { // ~30s (Aumentado para evitar timeout em conexões lentas)
                clearInterval(checkInterval);
                resolve();
            }
        }, 500);
    });

    if (!xmlContent) {
        console.warn('[Scraper] Download direto do XML falhou ou demorou muito. Verifique se o site mudou.');
        throw new Error("Falha ao baixar o arquivo XML. O botão foi clicado mas o arquivo não foi salvo.");
    }

    console.log('[Scraper] XML baixado com sucesso. Processando...');

    console.log('[Scraper] Processando dados do XML...');

    // Processa o conteúdo do XML usando o DOMParser do navegador (passamos o texto do XML para dentro do evaluate)
    const dadosExtraidos = await page.evaluate((xmlText: string) => {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, "text/xml");

            
            // Helper para pegar valor de tag
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

            return {
                description: emitente || "Nota Fiscal",
                amount: valorTotal,
                date: dataEmissao,
                notes: infCpl,
                products
            };
        } catch (e) {
            return null;
        }
    }, xmlContent);

    // Limpeza
    try {
        if (fs.existsSync(downloadPath)) {
            fs.rmSync(downloadPath, { recursive: true, force: true });
        }
    } catch (e) {}

    if (!dadosExtraidos) throw new Error("Falha ao baixar ou processar o XML.");

  } catch (error) {
    console.error('[Scraper] Erro:', error);
    throw error;
  } finally {
    // A aba não é fechada para que possa ser reutilizada na próxima consulta.
    // Em caso de erro, o usuário pode precisar fechar a aba manualmente se ela travar.
    // if (page) await page.close();
  }
}