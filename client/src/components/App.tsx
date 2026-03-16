import { Switch, Route, Redirect } from "wouter";
import DashboardLayoutCustom from "./DashboardLayoutCustom";
import Home from "../pages/Home";
import Login from "../pages/Login";
import Dashboard from "../pages/Dashboard";
import ProjectsPage from "../pages/ProjectsPage";
import BudgetsPage from "../pages/BudgetsPage";
import AssetsPage from "../pages/AssetsPage";
import AssetMovementsPage from "../pages/AssetMovementsPage";
import AssetDepreciationPage from "../pages/AssetDepreciationPage";
import AssetInventoryPage from "../pages/AssetInventoryPage";
import ReportsPage from "../pages/ReportsPage";
import AccountingStructurePage from "../pages/AccountingStructurePage";
import UserPage from "../pages/UserPage";
import NotificationsPage from "../pages/NotificationsPage";
import NotFound from "../pages/NotFound";
import { useAuth } from "../_core/hooks/useAuth";

function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div>Carregando...</div>;
  }

  return (
    isAuthenticated ? (
      <DashboardLayoutCustom>
        <Switch>
          <Route path="/"><Redirect to="/dashboard" /></Route>
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/notifications" component={NotificationsPage} />
          <Route path="/projects" component={ProjectsPage} />
          <Route path="/budgets" component={BudgetsPage} />
          <Route path="/assets" component={AssetsPage} />
          <Route path="/asset-movements" component={AssetMovementsPage} />
          <Route path="/asset-depreciation" component={AssetDepreciationPage} />
          <Route path="/inventory" component={AssetInventoryPage} />
          <Route path="/reports" component={ReportsPage} />
          <Route path="/accounting" component={AccountingStructurePage} />
          <Route path="/users" component={UserPage} />
          <Route component={NotFound} />
        </Switch>
      </DashboardLayoutCustom>
    ) : (
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/" component={Home} />
        <Route><Redirect to="/" /></Route>
      </Switch>
    )
  );
}

export default App;