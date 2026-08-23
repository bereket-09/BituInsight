import { useState } from 'react';
import { Check, Save, Webhook, User } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';

const ICON_STROKE = 1.75;

/*
 * Two-column settings layout: the left rail explains what the group is for, the
 * right column holds the controls. It reads as a settings page rather than a
 * stack of anonymous cards, and it degrades to one column on small screens.
 */
function SettingsSection({ icon: Icon, title, description, children }) {
  return (
    <section className="grid gap-5 border-t border-noc-border pt-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-noc-accent" strokeWidth={ICON_STROKE} />
          <h2 className="text-sm font-semibold text-noc-text">{title}</h2>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-noc-muted">{description}</p>
      </div>
      <div className="card">{children}</div>
    </section>
  );
}

function Field({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-noc-border/60 py-3 first:pt-0 last:border-0 last:pb-0">
      <span className="text-xs uppercase tracking-[0.12em] text-noc-muted">{label}</span>
      <span className="truncate text-sm text-noc-text">{value || '—'}</span>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const [teamsWebhook, setTeamsWebhook] = useState(
    () => localStorage.getItem('coreinsight_teams_webhook') || ''
  );
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    localStorage.setItem('coreinsight_teams_webhook', teamsWebhook);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <header>
        <p className="eyebrow">Preferences</p>
        <h1 className="mt-2 text-display-md text-noc-text">Settings</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-noc-textDim">
          Account details and the integrations Core Insight uses to deliver reports.
        </p>
      </header>

      <SettingsSection
        icon={User}
        title="Account"
        description="The identity reports are filed under. Managed by your administrator."
      >
        <Field label="Name" value={user?.name} />
        <Field label="Email" value={user?.email} />
      </SettingsSection>

      <SettingsSection
        icon={Webhook}
        title="Microsoft Teams"
        description="Where completed reports are posted when Teams delivery is used."
      >
        <label
          htmlFor="teams-webhook"
          className="block text-xs font-medium uppercase tracking-[0.12em] text-noc-muted"
        >
          Incoming webhook URL
        </label>
        <input
          id="teams-webhook"
          type="url"
          value={teamsWebhook}
          onChange={(e) => setTeamsWebhook(e.target.value)}
          placeholder="https://outlook.office.com/webhook/..."
          className="input-field mt-2 font-mono text-xs"
        />
        <p className="mt-2 text-xs leading-relaxed text-noc-muted">
          Stored in this browser only. A server-wide default can be set with the
          <code className="mx-1 rounded bg-noc-bg px-1.5 py-0.5 font-mono text-[11px] text-noc-accent">
            TEAMS_WEBHOOK_URL
          </code>
          environment variable.
        </p>

        <div className="mt-5 flex items-center gap-3 border-t border-noc-border/60 pt-4">
          <button type="button" onClick={handleSave} className="btn-primary">
            <Save className="h-4 w-4" strokeWidth={ICON_STROKE} />
            Save settings
          </button>
          <span
            className={clsx(
              'inline-flex items-center gap-1.5 text-xs font-medium text-noc-success transition-opacity duration-200',
              saved ? 'opacity-100' : 'opacity-0'
            )}
            aria-live="polite"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2} />
            {saved ? 'Saved' : ''}
          </span>
        </div>
      </SettingsSection>
    </div>
  );
}
