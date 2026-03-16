import 'dotenv/config';
import { initializeApp, getApps, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

let db;
let auth;

try {
  let app;
  if (!getApps().length) {
    let serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    
    if (!serviceAccountKey) {
      throw new Error('A variável de ambiente FIREBASE_SERVICE_ACCOUNT_KEY não está definida.');
    }

    // Tenta limpar aspas extras que podem ter sido incluídas erroneamente no .env
    if (serviceAccountKey.startsWith("'") && serviceAccountKey.endsWith("'")) {
      serviceAccountKey = serviceAccountKey.slice(1, -1);
    }

    // Verificação específica para erro comum: colar apenas a chave privada
    if (serviceAccountKey.trim().startsWith("-----BEGIN PRIVATE KEY-----")) {
      console.error("❌ ERRO CRÍTICO DE CONFIGURAÇÃO:");
      console.error("   Você colou apenas a 'private_key' no arquivo .env.");
      console.error("   A variável FIREBASE_SERVICE_ACCOUNT_KEY precisa do CONTEÚDO INTEIRO do arquivo JSON baixado do Firebase.");
      console.error("   O conteúdo correto começa com '{' e contém campos como 'type', 'project_id', etc.");
      throw new Error('A variável contém apenas a chave privada, mas requer o JSON completo da conta de serviço.');
    }

    let serviceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountKey);
    } catch (error) {
      console.error("❌ ERRO DE PARSE DO JSON: A chave em FIREBASE_SERVICE_ACCOUNT_KEY não é um JSON válido.");
      console.error(`   Conteúdo recebido (início): ${serviceAccountKey.substring(0, 30)}...`);
      console.error("👉 Verifique se você copiou o conteúdo COMPLETO do arquivo JSON e colou em UMA ÚNICA linha dentro de aspas simples ('').");
      throw new Error('A variável FIREBASE_SERVICE_ACCOUNT_KEY não contém um JSON válido.');
    }

    // Garante que as quebras de linha na chave privada estejam no formato correto
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }

    app = initializeApp({
      credential: cert(serviceAccount),
      projectId: "logistica-7343c",
      storageBucket: "logistica-7343c.firebasestorage.app",
    });
    console.log(`🔥 Firebase Admin SDK inicializado. Projeto: ${app.options.projectId}`);
  } else {
    app = getApp();
  }

  db = getFirestore();
  auth = getAuth();

} catch (error: any) {
  console.error("❌ Erro ao inicializar Firebase Admin:", error.message);
  console.error(`📂 Diretório de execução: ${process.cwd()}`);
  console.error("👉 O servidor não pode iniciar. Verifique as variáveis de ambiente (FIREBASE_SERVICE_ACCOUNT_KEY) no seu ambiente de produção (Vercel).");
  // Em um ambiente serverless (como a Vercel), `process.exit()` pode causar o encerramento abrupto
  // da função e mascarar o erro original. Lançar o erro permite que a plataforma o capture e registre corretamente.
  throw new Error(`Falha na inicialização do Firebase Admin: ${error.message}`);
}

export { db, auth };