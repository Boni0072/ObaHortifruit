import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayoutCustom";
import Dashboard from "./pages/Dashboard";
import ProjectsPage from "./pages/ProjectsPage";
import BudgetsPage from "./pages/BudgetsPage";
import AssetsPage from "./pages/AssetsPage";
import AccountingStructurePage from "./pages/AccountingStructurePage";
import Home from "./pages/Home";
import UserPage from "./pages/UserPage";
import Login from "./pages/Login";
import AssetInventoryPage from "./pages/AssetInventoryPage";
import ReportsPage from "./pages/ReportsPage";
import AssetDepreciationPage from "./pages/AssetDepreciationPage";
import AssetMovementsPage from "./pages/AssetMovementsPage";

// App Router Configuration
function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/login"} component={Login} />
      <Route path={"/dashboard"}>
        {() => (
          <DashboardLayout>
            <Dashboard />
          </DashboardLayout>
        )}
      </Route>
      <Route path={"/projects"}>
        {() => (
          <DashboardLayout>
            <ProjectsPage />
          </DashboardLayout>
        )}
      </Route>
      <Route path={"/budgets"}>
        {() => (
          <DashboardLayout>
            <BudgetsPage />
          </DashboardLayout>
        )}
      </Route>
      <Route path={"/assets"}>
        {() => (
          <DashboardLayout>
            <AssetsPage />
          </DashboardLayout>
        )}
      </Route>
      <Route path={"/asset-movements"}>
        {() => (
          <DashboardLayout>
            <AssetMovementsPage />
          </DashboardLayout>
        )}
      </Route>
      <Route path={"/asset-depreciation"}>
        {() => (
          <DashboardLayout>
            <AssetDepreciationPage />
          </DashboardLayout>
        )}
      </Route>
      <Route path={"/inventory"}>
        {() => (
          <DashboardLayout>
            <AssetInventoryPage />
          </DashboardLayout>
        )}
      </Route>
      <Route path={"/reports"}>
        {() => (
          <DashboardLayout>
            <ReportsPage />
          </DashboardLayout>
        )}
      </Route>
      <Route path={"/accounting"}>
        {() => (
          <DashboardLayout>
            <AccountingStructurePage />
          </DashboardLayout>
        )}
      </Route>
      <Route path={"/users"}>
        {() => (
          <DashboardLayout>
            <UserPage />
          </DashboardLayout>
        )}
      </Route>
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
