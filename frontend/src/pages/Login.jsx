import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';

export default function Login() {
  const [email, setEmail] = useState('admin@coreinsight.local');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <div className="hidden flex-1 flex-col justify-between bg-gradient-to-br from-noc-accent/20 via-noc-bg to-noc-bg p-12 lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-noc-accent">
            <Radio className="h-6 w-6 text-white" />
          </div>
          <span className="text-xl font-bold">Core Insight</span>
        </div>
        <div>
          <h2 className="text-4xl font-bold leading-tight">
            Telecom KPI
            <br />
            <span className="text-noc-accent">Analytics Platform</span>
          </h2>
          <p className="mt-4 max-w-md text-noc-muted">
            Ingest Excel KPI reports, run workflow-specific transformations, generate
            operational dashboards, and deliver insights to Microsoft Teams.
          </p>
        </div>
        <p className="text-xs text-noc-muted">© 2026 Core Insight — NOC-grade analytics</p>
      </div>

      <div className="relative flex flex-1 items-center justify-center p-8">
        <div className="absolute right-6 top-6">
          <ThemeToggle showLabel />
        </div>
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-6">
          <div className="lg:hidden">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-noc-accent">
                <Radio className="h-6 w-6 text-white" />
              </div>
              <span className="text-xl font-bold">Core Insight</span>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold">Sign in</h2>
            <p className="mt-1 text-sm text-noc-muted">Access your KPI analytics portal</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-noc-muted">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-noc-muted">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                required
              />
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Signing in...' : 'Sign in'}
          </button>

          <p className="text-center text-xs text-noc-muted">
            Default: admin@coreinsight.local / admin123
          </p>
        </form>
      </div>
    </div>
  );
}
