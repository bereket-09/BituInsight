import { useState } from 'react';
import { Settings as SettingsIcon, Webhook, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

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
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-noc-muted">Configure integrations and preferences</p>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-noc-accent" />
          <h2 className="text-sm font-semibold">Account</h2>
        </div>
        <div className="grid gap-3 text-sm">
          <div className="flex justify-between">
            <span className="text-noc-muted">Name</span>
            <span>{user?.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-noc-muted">Email</span>
            <span>{user?.email}</span>
          </div>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <Webhook className="h-4 w-4 text-noc-accent" />
          <h2 className="text-sm font-semibold">Microsoft Teams Integration</h2>
        </div>
        <p className="text-xs text-noc-muted">
          Configure your default Incoming Webhook URL for Teams report delivery.
          Server-side default can also be set via TEAMS_WEBHOOK_URL environment variable.
        </p>
        <input
          type="url"
          value={teamsWebhook}
          onChange={(e) => setTeamsWebhook(e.target.value)}
          placeholder="https://outlook.office.com/webhook/..."
          className="input-field"
        />
        <button onClick={handleSave} className="btn-primary">
          <SettingsIcon className="h-4 w-4" />
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
