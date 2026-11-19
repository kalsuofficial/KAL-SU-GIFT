import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { X, Lock, Mail, User, Phone, KeyRound } from 'lucide-react';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import type { CurrencyCode, LangCode, UserProfile } from '../types.ts';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'login' | 'register';
  lang: LangCode;
  currency: CurrencyCode;
  onClose: () => void;
  onAuthenticated: (profile: UserProfile, localToken?: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'login',
  lang,
  currency,
  onClose,
  onAuthenticated,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  if (!isOpen) return null;

  const labels = {
    fr: {
      loginTitle: 'Connexion KAL-SU GIFT',
      registerTitle: 'Créer un compte client',
      forgotTitle: 'Mot de passe oublié',
      resetTitle: 'Nouveau mot de passe',
      fullName: 'Nom complet',
      email: 'Adresse email',
      phone: 'Téléphone (ex: +509 3700-0000)',
      password: 'Mot de passe (min. 8 caractères)',
      submitLogin: 'Se connecter',
      submitRegister: 'Créer mon compte',
      submitForgot: 'Envoyer le code',
      submitReset: 'Mettre à jour le mot de passe',
      googleBtn: 'Continuer avec Google',
      switchToRegister: 'Pas encore de compte ? S’inscrire',
      switchToLogin: 'Déjà inscrit ? Se connecter',
      forgotLink: 'Mot de passe oublié ?',
    },
    es: {
      loginTitle: 'Iniciar sesión en KAL-SU GIFT',
      registerTitle: 'Crear cuenta de cliente',
      forgotTitle: 'Recuperar contraseña',
      resetTitle: 'Nueva contraseña',
      fullName: 'Nombre completo',
      email: 'Correo electrónico',
      phone: 'Teléfono (ej: +509 3700-0000)',
      password: 'Contraseña (mín. 8 caracteres)',
      submitLogin: 'Entrar',
      submitRegister: 'Crear mi cuenta',
      submitForgot: 'Enviar código',
      submitReset: 'Actualizar contraseña',
      googleBtn: 'Continuar con Google',
      switchToRegister: '¿No tienes cuenta? Regístrate',
      switchToLogin: '¿Ya tienes cuenta? Inicia sesión',
      forgotLink: '¿Olvidaste tu contraseña?',
    },
    en: {
      loginTitle: 'Sign in to KAL-SU GIFT',
      registerTitle: 'Create Customer Account',
      forgotTitle: 'Forgot Password',
      resetTitle: 'Set New Password',
      fullName: 'Full Name',
      email: 'Email Address',
      phone: 'Phone Number (e.g. +509 3700-0000)',
      password: 'Password (min. 8 characters)',
      submitLogin: 'Sign In',
      submitRegister: 'Create Account',
      submitForgot: 'Send Reset Code',
      submitReset: 'Update Password',
      googleBtn: 'Continue with Google',
      switchToRegister: 'Need an account? Sign Up',
      switchToLogin: 'Already registered? Sign In',
      forgotLink: 'Forgot password?',
    },
  }[lang];

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      const resp = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Authentication failed');
      onAuthenticated(data.profile);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur Google Sign-In');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const resp = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Connexion impossible');
        onAuthenticated(data.profile, data.token);
        onClose();
      } else if (mode === 'register') {
        const resp = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName,
            email,
            phone,
            password,
            preferredLang: lang,
            preferredCurrency: currency,
          }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Inscription impossible');
        onAuthenticated(data.profile, data.token);
        onClose();
      } else if (mode === 'forgot') {
        const resp = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Erreur');
        setInfo(data.message);
        setMode('reset');
      } else if (mode === 'reset') {
        const resp = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, token: resetToken, newPassword: password }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Code invalide');
        setInfo('Mot de passe mis à jour. Connectez-vous.');
        setMode('login');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur serveur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#060912] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <h2 className="font-display text-xl font-bold text-white">
            {mode === 'login'
              ? labels.loginTitle
              : mode === 'register'
              ? labels.registerTitle
              : mode === 'forgot'
              ? labels.forgotTitle
              : labels.resetTitle}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {(mode === 'login' || mode === 'register') && (
          <div className="mt-5">
            <button
              type="button"
              disabled={loading}
              onClick={handleGoogleSignIn}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-white/15 bg-white/5 py-2.5 px-4 text-sm font-semibold text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z" />
                <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z" />
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z" />
              </svg>
              {labels.googleBtn}
            </button>
            <div className="my-4 flex items-center gap-3 text-xs text-slate-500">
              <div className="h-px flex-1 bg-white/10" />
              <span>OU</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            {error}
          </div>
        )}
        {info && (
          <div className="mb-4 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-200">
            {info}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-300">{labels.fullName}</span>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#000000] pl-10 pr-3 py-2.5 text-sm text-white focus:border-[#0066FF] focus:outline-none"
                  />
                </div>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-300">{labels.phone}</span>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+509 3700-0000"
                    className="w-full rounded-xl border border-white/10 bg-[#000000] pl-10 pr-3 py-2.5 text-sm text-white focus:border-[#0066FF] focus:outline-none"
                  />
                </div>
              </label>
            </>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-300">{labels.email}</span>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#000000] pl-10 pr-3 py-2.5 text-sm text-white focus:border-[#0066FF] focus:outline-none"
              />
            </div>
          </label>

          {mode === 'reset' && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-300">Code reçu</span>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#000000] pl-10 pr-3 py-2.5 text-sm font-mono text-white focus:border-[#0066FF] focus:outline-none"
                />
              </div>
            </label>
          )}

          {mode !== 'forgot' && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-300">{labels.password}</span>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#000000] pl-10 pr-3 py-2.5 text-sm text-white focus:border-[#0066FF] focus:outline-none"
                />
              </div>
            </label>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-xl bg-[#0066FF] py-3 text-sm font-semibold text-white hover:bg-[#0052CC] transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading
              ? '...'
              : mode === 'login'
              ? labels.submitLogin
              : mode === 'register'
              ? labels.submitRegister
              : mode === 'forgot'
              ? labels.submitForgot
              : labels.submitReset}
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          {mode === 'login' ? (
            <>
              <button
                type="button"
                onClick={() => { setMode('register'); setError(''); }}
                className="hover:text-white cursor-pointer"
              >
                {labels.switchToRegister}
              </button>
              <button
                type="button"
                onClick={() => { setMode('forgot'); setError(''); }}
                className="text-[#D4AF37] hover:underline cursor-pointer"
              >
                {labels.forgotLink}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); }}
              className="hover:text-white cursor-pointer"
            >
              {labels.switchToLogin}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
