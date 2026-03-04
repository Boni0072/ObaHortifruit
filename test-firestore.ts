import { db } from "./firebase";

async function runTest() {
  console.log("---------------------------------------------------------");
  console.log("🔥 DIAGNÓSTICO DE CONEXÃO FIREBASE");
  console.log("---------------------------------------------------------");
  
  try {
    console.log("1️⃣  Tentando escrever na coleção 'setup_logs'...");
    const docRef = await db.collection("setup_logs").add({
      message: "Teste de conexão realizado com sucesso",
      timestamp: new Date().toISOString(),
      user: "admin-test"
    });
    console.log(`✅ Sucesso! Documento escrito com ID: ${docRef.id}`);

    console.log("2️⃣  Tentando ler a coleção 'setup_logs' para confirmar gravação...");
    const snapshot = await db.collection("setup_logs").get();
    console.log(`✅ Sucesso! Lidos ${snapshot.size} documentos do banco.`);
    
    console.log("---------------------------------------------------------");
    console.log("🎉 O servidor está conectado corretamente ao Firebase.");
    console.log("👉 Se o banco parece vazio no navegador, verifique:");
    console.log("   1. Se você selecionou o projeto correto no topo do Console Firebase.");
    console.log("   2. Se você está olhando para o banco de dados '(default)'.");
    console.log("---------------------------------------------------------");

  } catch (error: any) {
    console.error("❌ ERRO FATAL NO TESTE:");
    console.error(error);
  }
}

runTest();