import { useState } from 'react';
import { signIn, signUp } from '../lib/supabase';

type AuthPanelProps = {
  onSuccess?: () => void;
};

export default function AuthPanel({ onSuccess }: AuthPanelProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email || !password) {
      alert('E-posta ve şifre gir.');
      return;
    }

    setLoading(true);

    const result =
      mode === 'login'
        ? await signIn(email, password)
        : await signUp(email, password);

    setLoading(false);

    if (result.error) {
      alert(result.error.message);
      return;
    }

    alert(mode === 'login' ? 'Giriş başarılı' : 'Kayıt başarılı');
    onSuccess?.();
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#030712',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          padding: 24,
          borderRadius: 16,
          background: '#111827',
          border: '1px solid #1f2937',
          color: 'white',
          boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>
          {mode === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
        </h2>

        <p style={{ marginTop: 0, marginBottom: 16, color: '#9ca3af' }}>
          Caylaklar Sesli Sohbet hesabınla devam et.
        </p>

        <input
          type="email"
          placeholder="E-posta"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: '100%',
            padding: 12,
            marginBottom: 12,
            borderRadius: 10,
            border: '1px solid #374151',
            background: '#0b1220',
            color: 'white',
            outline: 'none',
          }}
        />

        <input
          type="password"
          placeholder="Şifre"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: '100%',
            padding: 12,
            marginBottom: 12,
            borderRadius: 10,
            border: '1px solid #374151',
            background: '#0b1220',
            color: 'white',
            outline: 'none',
          }}
        />

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: '100%',
            padding: 12,
            borderRadius: 10,
            border: 'none',
            cursor: 'pointer',
            marginBottom: 10,
          }}
        >
          {loading
            ? 'Bekleniyor...'
            : mode === 'login'
            ? 'Giriş Yap'
            : 'Kayıt Ol'}
        </button>

        <button
          onClick={() =>
            setMode((prev) => (prev === 'login' ? 'register' : 'login'))
          }
          style={{
            width: '100%',
            padding: 12,
            borderRadius: 10,
            border: '1px solid #374151',
            background: 'transparent',
            color: 'white',
            cursor: 'pointer',
          }}
        >
          {mode === 'login'
            ? 'Hesabın yok mu? Kayıt ol'
            : 'Zaten hesabın var mı? Giriş yap'}
        </button>
      </div>
    </div>
  );
}