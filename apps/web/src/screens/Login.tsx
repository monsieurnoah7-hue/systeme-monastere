import { useState, type FormEvent } from 'react';
import { api, type User } from '../lib/api';
import { Banner, Button, Field } from '../components/ui';

const DEMO: { login: string; password: string; label: string }[] = [
  { login: 'direction', password: 'direction226', label: 'Direction' },
  { login: 'magasinier', password: 'magasin226', label: 'Magasinier' },
  { login: 'chef', password: 'atelier226', label: 'Chef d’atelier' },
];

export function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ user: User | null }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ login, password }),
      });
      if (!res.user) {
        setError('Identifiant ou mot de passe incorrect.');
        return;
      }
      onLogin(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-charcoal px-4 py-10">
      <div className="w-full max-w-[26rem]">
        <div className="mb-6 flex items-center gap-3 text-white">
          <span className="grid h-11 w-11 place-items-center rounded-btn bg-amber text-lg font-semibold">M</span>
          <div className="leading-tight">
            <p className="text-[15px] font-semibold">Menuiserie du Mont Fèbè</p>
            <p className="text-[13px] text-white/55">Monastère des Bénédictins — Yaoundé</p>
          </div>
        </div>

        <div className="rise rounded-card border border-white/10 bg-surface p-6 shadow-pop">
          <h1 className="text-lg font-semibold text-ink">Connexion</h1>
          <p className="mt-1 text-sm text-ink-soft">Accès réservé aux profils autorisés.</p>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field
              label="Identifiant"
              value={login}
              autoComplete="username"
              onChange={(event) => setLogin(event.target.value)}
              placeholder="ex. magasinier"
              aria-invalid={error ? true : undefined}
              autoFocus
              required
            />
            <Field
              label="Mot de passe"
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              aria-invalid={error ? true : undefined}
              required
            />
            {error ? (
              <Banner tone="error" className="shake" key={error}>
                {error}
              </Banner>
            ) : null}
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
              {busy ? 'Connexion…' : 'Se connecter'}
            </Button>
          </form>

          {import.meta.env.DEV ? (
            <div className="mt-6 border-t border-line pt-4">
              <p className="text-[12px] font-medium uppercase tracking-wide text-ink-faint">
                Comptes de démonstration
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {DEMO.map((account) => (
                  <button
                    key={account.login}
                    type="button"
                    onClick={() => {
                      setLogin(account.login);
                      setPassword(account.password);
                    }}
                    className="rounded-chip border border-line-strong bg-surface-2 px-2.5 py-1 text-[12px] font-medium text-ink-soft transition-colors duration-150 hover:border-amber hover:text-amber focus-visible:border-amber focus-visible:text-amber"
                  >
                    {account.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <p className="mt-4 text-center text-[12px] text-white/40">
          Pointage sur terminal enregistré — aucun compte requis pour pointer.
        </p>
      </div>
    </div>
  );
}
