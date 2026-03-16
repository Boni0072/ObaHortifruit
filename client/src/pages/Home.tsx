import { BarChart3, DollarSign, FileText, Package, TrendingUp } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <div className="text-2xl font-bold text-white">Obras</div>
        <a href="/login" className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition">
          Entrar
        </a>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-20 text-center">
        <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
          Gestão Completa de Obras e Projetos
        </h1>
        <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
          Sistema elegante para controle financeiro, acompanhamento de budgets e gestão de ativos em andamento com classificação Capex/Opex.
        </p>
        <a
          href="/login"
          className="inline-block px-8 py-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition text-lg"
        >
          Começar Agora
        </a>
      </section>

      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-white text-center mb-16">Funcionalidades Principais</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 hover:border-blue-500 transition">
            <FileText className="w-12 h-12 text-blue-400 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Gestão de Obras</h3>
            <p className="text-gray-300">Cadastro e acompanhamento completo de projetos com status em tempo real.</p>
          </div>

          {/* Feature 2 */}
          <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 hover:border-blue-500 transition">
            <DollarSign className="w-12 h-12 text-green-400 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Controle de Budgets</h3>
            <p className="text-gray-300">Planejamento e acompanhamento de orçamentos com análise de variações.</p>
          </div>

          {/* Feature 3 */}
          <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 hover:border-blue-500 transition">
            <BarChart3 className="w-12 h-12 text-purple-400 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Classificação Capex/Opex</h3>
            <p className="text-gray-300">Categorização automática de despesas para análise contábil adequada.</p>
          </div>

          {/* Feature 4 */}
          <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 hover:border-blue-500 transition">
            <Package className="w-12 h-12 text-orange-400 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Gestão de Ativos</h3>
            <p className="text-gray-300">Acompanhamento de ativos em desenvolvimento vinculados aos projetos.</p>
          </div>

          {/* Feature 5 */}
          <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 hover:border-blue-500 transition">
            <TrendingUp className="w-12 h-12 text-red-400 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Dashboard Executivo</h3>
            <p className="text-gray-300">Visualizações em tempo real com gráficos e filtros avançados.</p>
          </div>

          {/* Feature 6 */}
          <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 hover:border-blue-500 transition">
            <TrendingUp className="w-12 h-12 text-cyan-400 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Relatórios Detalhados</h3>
            <p className="text-gray-300">Análises completas de despesas, budgets e status de projetos.</p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl font-bold text-white mb-6">Pronto para começar?</h2>
        <p className="text-gray-300 mb-8">Acesse agora e tenha controle total sobre suas obras e projetos.</p>
        <a
          href="/login"
          className="inline-block px-8 py-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition text-lg"
        >
          Entrar no Sistema
        </a>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-700 py-8 text-center text-gray-400">
        <p>&copy; 2026 Sistema de Gestão de Obras. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
