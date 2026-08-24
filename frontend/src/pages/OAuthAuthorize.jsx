import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Eye,
  Loader2,
  Lock,
  LogOut,
  ShieldCheck,
  X,
} from 'lucide-react';
import { oauthApi } from '../api';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import { BrandMark } from '../components/Layout';

const ICON_STROKE = 1.75;

/**
 * The consent screen an AI assistant sends the operator to.
 *
 * Reachable without a session on purpose: the person arrives here straight from
 * their assistant and may not be signed in. The page therefore has to do three
 * things in order — say who is asking, establish who the person is, and only
 * then take a decision. Sign-in is folded into the card rather than bounced
 * through /login, because a redirect would lose the request the assistant is
 * waiting on.
 *
 * The read-only nature of the grant is stated as a fact of the page, not as fine
 * print: it is the single most important thing the person is agreeing to.
 */

function Shell({ children }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-noc-bg px-6 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 right-1/4 h-[26rem] w-[26rem] rounded-full bg-noc-accent/10 blur-[130px]"
      />
      <div className="absolute right-5 top-5">
        <ThemeToggle iconOnly />
      </div>

      <div className="relative w-full max-w-lg">
        <div className="mb-8 flex items-center gap-3">
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
        {children}
      </div>
    </div>
  );
}

function Problem({ title, detail }) {
  return (
    <Shell>
      <div className="card">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-noc-danger/10 text-noc-danger">
          <AlertCircle strokeWidth={ICON_STROKE} className="h-5 w-5" />
        </span>
        <h1 className="mt-5 text-display-md">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-noc-muted">{detail}</p>
        <p className="mt-6 text-sm text-noc-textDim">
          Start the connection again from your assistant to get a fresh request.
        </p>
      </div>
    </Shell>
  );
}

export default function OAuthAuthorize() {
  const [params] = useSearchParams();
  const requestId = params.get('request_id');
  const { user, isAuthenticated, loading: authLoading, login, logout } = useAuth();

  const [request, setRequest] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState('');

  const [deciding, setDeciding] = useState(null);
  const [decisionError, setDecisionError] = useState('');

  useEffect(() => {
    if (!requestId) {
      setLoadError({ title: 'No request to approve', detail: 'This link is missing its request.' });
      setLoading(false);
      return;
    }
    let active = true;
    oauthApi
      .consent(requestId)
      .then((res) => {
        if (active) setRequest(res.data);
      })
      .catch((err) => {
        if (!active) return;
        const code = err.response?.data?.code;
        setLoadError(
          code === 'expired'
            ? { title: 'This request expired', detail: 'Approval requests are valid for ten minutes.' }
            : code === 'already_resolved'
              ? {
                  title: 'Already answered',
                  detail: 'This request has already been approved or denied.',
                }
              : {
                  title: 'Request not found',
                  detail:
                    err.response?.data?.error || 'Core Insight has no record of this approval request.',
                }
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [requestId]);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setSignInError('');
    setSigningIn(true);
    try {
      await login(email, password);
    } catch (err) {
      setSignInError(err.response?.data?.error || 'Sign in failed');
    } finally {
      setSigningIn(false);
    }
  };

  /* Both outcomes end the same way: the server hands back where to send the
     browser, and the browser goes there. The page never builds that URL itself. */
  const decide = useCallback(
    async (outcome) => {
      setDecisionError('');
      setDeciding(outcome);
      try {
        const res =
          outcome === 'approve'
            ? await oauthApi.approve(requestId)
            : await oauthApi.deny(requestId);
        window.location.replace(res.data.redirectTo);
      } catch (err) {
        setDeciding(null);
        setDecisionError(
          err.response?.data?.error || 'Core Insight could not complete this request.'
        );
      }
    },
    [requestId]
  );

  if (loading || authLoading) {
    return (
      <Shell>
        <div className="card">
          <span className="skeleton block h-3 w-24" />
          <span className="skeleton mt-4 block h-7 w-64 max-w-full" />
          <span className="skeleton mt-6 block h-24 w-full rounded-xl" />
          <span className="skeleton mt-6 block h-11 w-full rounded-xl" />
        </div>
      </Shell>
    );
  }

  if (loadError) return <Problem title={loadError.title} detail={loadError.detail} />;
  if (!request) return null;

  const clientName = request.client.name;

  return (
    <Shell>
      <div className="card">
        <p className="eyebrow">Connection request</p>
        <h1 className="mt-3 text-display-md">
          Let {clientName} read your Core Insight data?
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-noc-muted">
          {clientName} is asking to connect to Core Insight on your behalf. Approving
          gives it access to your account only.
        </p>

        {/* The one thing that must not be missed. */}
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-noc-accent/25 bg-noc-accent/[0.07] px-4 py-3.5">
          <ShieldCheck
            strokeWidth={ICON_STROKE}
            className="mt-0.5 h-5 w-5 shrink-0 text-noc-accent"
          />
          <span className="text-sm leading-relaxed text-noc-text">
            <span className="font-semibold">Read-only access.</span> {clientName} can look at
            your data. It cannot upload, change, export or delete anything, and it cannot
            reach any other account.
          </span>
        </div>

        <dl className="mt-6 space-y-3">
          {request.scopes.map((scope) => (
            <div key={scope.scope} className="flex items-start gap-3">
              <Eye
                strokeWidth={ICON_STROKE}
                className="mt-0.5 h-4 w-4 shrink-0 text-noc-textDim"
              />
              <span>
                <dt className="text-sm font-medium text-noc-text">{scope.label}</dt>
                <dd className="mt-0.5 text-xs leading-relaxed text-noc-muted">
                  {scope.description}
                </dd>
              </span>
            </div>
          ))}
        </dl>

        <div className="mt-6 rounded-xl border border-noc-border bg-noc-surface px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-noc-muted">
            Returns to
          </p>
          <p className="mt-1 break-all font-mono text-xs text-noc-textDim">
            {request.client.redirectUri}
          </p>
        </div>

        {decisionError && (
          <div
            role="alert"
            className="mt-6 flex items-start gap-2.5 rounded-xl border border-noc-danger/30 bg-noc-danger/10 px-4 py-3 text-sm text-noc-danger"
          >
            <AlertCircle strokeWidth={ICON_STROKE} className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{decisionError}</span>
          </div>
        )}

        {isAuthenticated ? (
          <>
            <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-noc-border pt-5">
              <span className="text-xs text-noc-muted">
                Approving as{' '}
                <span className="font-medium text-noc-text">{user?.name || user?.email}</span>
              </span>
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-noc-textDim transition-colors hover:text-noc-accent"
              >
                <LogOut strokeWidth={ICON_STROKE} className="h-3.5 w-3.5" />
                Use a different account
              </button>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => decide('deny')}
                disabled={Boolean(deciding)}
                className="btn-secondary flex-1"
              >
                {deciding === 'deny' ? (
                  <Loader2 strokeWidth={ICON_STROKE} className="h-4 w-4 animate-spin" />
                ) : (
                  <X strokeWidth={ICON_STROKE} className="h-4 w-4" />
                )}
                Deny
              </button>
              <button
                type="button"
                onClick={() => decide('approve')}
                disabled={Boolean(deciding)}
                className="btn-primary flex-1"
              >
                {deciding === 'approve' ? (
                  <Loader2 strokeWidth={ICON_STROKE} className="h-4 w-4 animate-spin" />
                ) : (
                  <Check strokeWidth={ICON_STROKE} className="h-4 w-4" />
                )}
                Approve read-only access
              </button>
            </div>
          </>
        ) : (
          <div className="mt-7 border-t border-noc-border pt-5">
            <p className="flex items-center gap-2 text-sm font-medium text-noc-text">
              <Lock strokeWidth={ICON_STROKE} className="h-4 w-4 text-noc-textDim" />
              Sign in to continue
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-noc-muted">
              Core Insight needs to know whose data {clientName} would be reading.
            </p>

            <form onSubmit={handleSignIn} className="mt-5 space-y-4">
              {signInError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-noc-danger/30 bg-noc-danger/10 px-4 py-3 text-sm text-noc-danger"
                >
                  <AlertCircle strokeWidth={ICON_STROKE} className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{signInError}</span>
                </div>
              )}

              <div>
                <label
                  htmlFor="consent-email"
                  className="mb-1.5 block text-xs font-medium text-noc-textDim"
                >
                  Email
                </label>
                <input
                  id="consent-email"
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
                  htmlFor="consent-password"
                  className="mb-1.5 block text-xs font-medium text-noc-textDim"
                >
                  Password
                </label>
                <input
                  id="consent-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field"
                  required
                />
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => decide('deny')}
                  disabled={Boolean(deciding) || signingIn}
                  className="btn-secondary flex-1"
                >
                  {deciding === 'deny' ? (
                    <Loader2 strokeWidth={ICON_STROKE} className="h-4 w-4 animate-spin" />
                  ) : (
                    <X strokeWidth={ICON_STROKE} className="h-4 w-4" />
                  )}
                  Deny
                </button>
                <button type="submit" disabled={signingIn} className="btn-primary flex-1">
                  {signingIn ? (
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
              </div>
            </form>
          </div>
        )}
      </div>

      <p className="mt-6 text-center text-xs leading-relaxed text-noc-muted">
        You can revoke this access at any time. Denying sends {clientName} away
        empty-handed and nothing is shared.
      </p>
    </Shell>
  );
}
