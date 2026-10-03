import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { SidebarProvider } from './context/SidebarContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import ReportDetails from './pages/ReportDetails';
import WorkbookReport from './pages/WorkbookReport';
import HistoricalReports from './pages/HistoricalReports';
import AggregateView from './pages/AggregateView';
import WorkflowExplorer from './pages/WorkflowExplorer';
import AutomaticImports from './pages/AutomaticImports';
import Settings from './pages/Settings';
import OAuthAuthorize from './pages/OAuthAuthorize';
import LoadingSpinner from './components/LoadingSpinner';

function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <LoadingSpinner fullScreen />;
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/*
        Outside PrivateRoute deliberately. An assistant sends the person straight
        here from its own app, so they may well arrive with no session; the page
        signs them in itself rather than bouncing to /login and losing the
        request the assistant is waiting on.
      */}
      <Route path="/oauth/authorize" element={<OAuthAuthorize />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <SidebarProvider>
              <Layout />
            </SidebarProvider>
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="upload" element={<Upload />} />
        <Route path="reports" element={<HistoricalReports />} />
        <Route path="reports/aggregate/:workflowSlug" element={<AggregateView />} />
        <Route path="workbooks/:id" element={<WorkbookReport />} />
        <Route path="reports/:id" element={<ReportDetails />} />
        <Route path="workflows" element={<WorkflowExplorer />} />
        <Route path="imports" element={<AutomaticImports />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
