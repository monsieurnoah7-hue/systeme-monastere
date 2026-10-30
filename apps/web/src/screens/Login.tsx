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
    <div className="relative flex min-h-full items-center justify-center bg-paper px-4 py-10 overflow-hidden">
      {/* Antigravity Atmospheric Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-blue-500/5 blur-[120px] pointer-events-none rounded-full" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-[400px] h-[250px] bg-amber-500/5 blur-[100px] pointer-events-none rounded-full" />

      <div className="relative z-10 w-full max-w-[26rem]">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-2.5 grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 border border-line p-2.5 shadow-pop">
            <img src="/emblem-white.png" alt="Croix Bénédictine" className="h-9 w-9 object-contain" />
          </div>
          <p className="text-xs font-semibold tracking-wider text-ink-soft uppercase">
            C.F.T. Bénédictins du Mont Fébé
          </p>
          <h2 className="mt-1 text-base font-bold tracking-tight text-ink uppercase">
            Système Central de Gestion
          </h2>
          <p className="mt-0.5 text-xs text-amber font-medium">
            Menuiserie · Logistique &amp; Présences
          </p>
        </div>

        <div className="rise rounded-xl border border-line bg-surface p-6 shadow-pop backdrop-blur">
          <h1 className="text-base font-semibold text-ink">Connexion sécurisée</h1>
          <p className="mt-1 text-xs text-ink-soft">Accès réservé aux collaborateurs et administrateurs.</p>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field
              label="Identifiant"
              value={login}
              autoComplete="off"
              onChange={(event) => setLogin(event.target.value)}
              placeholder="ex. admin ou matricule"
              aria-invalid={error ? true : undefined}
              required
            />
            <Field
              label="Mot de passe"
              type="password"
              value={password}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Saisissez votre mot de passe"
              aria-invalid={error ? true : undefined}
              required
            />
            {error ? (
              <Banner tone="error" className="shake" key={error}>
                {error}
              </Banner>
            ) : null}
            <Button type="submit" variant="primary" size="md" className="w-full" loading={busy}>
              {busy ? 'Connexion en cours…' : 'Accéder à l’espace de travail'}
            </Button>
          </form>

          {import.meta.env.DEV ? (
            <div className="mt-6 border-t border-line pt-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                Comptes de test rapide
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {DEMO.map((account) => (
                  <button
                    key={account.login}
                    type="button"
                    onClick={() => {
                      setLogin(account.login);
                      setPassword(account.password);
                    }}
                    className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-soft transition-colors duration-150 hover:border-amber hover:text-amber"
                  >
                    {account.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
