import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import { BrandMark } from '../components/Layout';

const ICON_STROKE = 1.75;

/* Three concrete things the product does, in the order an operator meets them. */
const capabilities = [
  { step: '01', title: 'Ingest', copy: 'Excel KPI workbooks parsed and validated on upload.' },
  { step: '02', title: 'Transform', copy: 'Workflow rules applied per KPI, thresholds enforced.' },
  { step: '03', title: 'Distribute', copy: 'Dashboards, exports and Teams delivery from one run.' },
];

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
    <div className="min-h-screen lg:grid lg:grid-cols-[1.15fr_1fr]">
      {/*
        Asymmetric split: the narrative panel is deliberately wider than the form.
        The form is a task, not the subject — it sits on plain surface with no
        floating card, which is what makes the left side read as the brand moment.
      */}
      <aside className="relative hidden overflow-hidden border-r border-noc-border bg-noc-surface lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-32 h-[28rem] w-[28rem] rounded-full bg-noc-accent/20 blur-[120px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -left-24 h-[24rem] w-[24rem] rounded-full bg-noc-accent/10 blur-[120px]"
        />
        {/* Oversized watermark mark — depth without another hue. */}
        <BrandMark
          className="pointer-events-none absolute -bottom-24 right-[-6rem] h-[34rem] w-[34rem] text-noc-accent/[0.05]"
        />

        <header className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-noc-accent text-white shadow-glow">
            <BrandMark className="h-6 w-6" />
          </span>
          <span>
            <span className="block font-display text-lg font-semibold tracking-tight">
              Core Insight
            </span>
            <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-noc-muted">
              Telecom KPI
            </span>
          </span>
        </header>

        <div className="relative max-w-xl">
          <p className="eyebrow">Network operations</p>
          <h1 className="mt-4 text-display-xl">
            Every KPI report,
            <br />
            read the same way.
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-noc-textDim">
            One place to turn raw Excel exports into reviewed, thresholded and
            shareable network performance reporting.
          </p>

          <dl className="mt-10 grid max-w-lg gap-px overflow-hidden rounded-2xl border border-noc-border bg-noc-border sm:grid-cols-3">
            {capabilities.map(({ step, title, copy }) => (
              <div key={step} className="bg-noc-card p-4">
                <dt className="flex items-baseline gap-2">
                  <span className="font-mono text-[10px] text-noc-accent">{step}</span>
                  <span className="text-sm font-semibold text-noc-text">{title}</span>
                </dt>
                <dd className="mt-1.5 text-xs leading-relaxed text-noc-muted">{copy}</dd>
              </div>
            ))}
          </dl>
        </div>

        <footer className="relative flex items-center gap-2 text-[11px] text-noc-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-noc-accent" />
          <span>© 2026 Core Insight — NOC-grade analytics</span>
        </footer>
      </aside>

      <main className="relative flex min-h-screen flex-col justify-center px-6 py-12 sm:px-10 lg:px-14 xl:px-20">
        <div className="absolute right-5 top-5">
          <ThemeToggle iconOnly />
        </div>

        {/* Compact lockup for the single-column breakpoint. */}
        <div className="mb-10 flex items-center gap-3 lg:hidden">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-noc-accent text-white shadow-glow">
            <BrandMark className="h-6 w-6" />
          </span>
          <span>
            <span className="block font-display text-lg font-semibold tracking-tight">
              Core Insight
            </span>
            <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-noc-muted">
              Telecom KPI
            </span>
          </span>
        </div>

        <div className="w-full max-w-sm">
          <p className="eyebrow">Secure access</p>
          <h2 className="mt-3 text-display-md">Sign in</h2>
          <p className="mt-2 text-sm text-noc-muted">
            Use your Core Insight account to open the KPI portal.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-noc-danger/30 bg-noc-danger/10 px-4 py-3 text-sm text-noc-danger"
              >
                <AlertCircle strokeWidth={ICON_STROKE} className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="login-email"
                className="mb-1.5 block text-xs font-medium text-noc-textDim"
              >
                Email
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                required
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="mb-1.5 block text-xs font-medium text-noc-textDim"
              >
                Password
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                required
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? (
                <>
                  <Loader2 strokeWidth={ICON_STROKE} className="h-4 w-4 animate-spin" />
                  Signing in
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight strokeWidth={ICON_STROKE} className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 rounded-xl border border-dashed border-noc-border px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-noc-muted">
              Default credentials
            </p>
            <p className="mt-1.5 font-mono text-xs text-noc-textDim">
              admin@coreinsight.local · admin123
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
