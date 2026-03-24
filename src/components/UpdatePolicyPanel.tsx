import React, { useState, useEffect, useCallback } from 'react';
import { Save, AlertTriangle, CheckCircle2, Info, Zap, Shield, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { compareSemver, isBelowMin, isOutdated } from '../lib/versionCompare';

type UpdateLevel = 'optional' | 'recommended' | 'force';

interface PolicyData {
  latest_version: string;
  min_supported_version: string;
  update_level: UpdateLevel;
  reason: string;
  message: string;
}

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

const PRESETS: { label: string; icon: React.ReactNode; level: UpdateLevel; desc: string }[] = [
  { label: 'Normal', icon: <Info size={12} />, level: 'optional', desc: 'Kullanıcı isterse günceller' },
  { label: 'Önerilen', icon: <Zap size={12} />, level: 'recommended', desc: 'Güçlü öneri gösterilir' },
  { label: 'Zorunlu', icon: <Lock size={12} />, level: 'force', desc: 'Uygulama kilitlenir' },
];

const inputCls = 'w-full rounded-lg border border-[var(--theme-border)]/40 bg-[var(--theme-bg)] px-3 py-2 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/30 focus:outline-none focus:border-[var(--theme-accent)]/50 transition-colors';
const labelCls = 'block text-[10px] font-bold uppercase tracking-wider text-[var(--theme-secondary-text)] mb-1.5';
const hintCls = 'text-[9px] text-[var(--theme-secondary-text)]/40 mt-1';

interface Props {
  appVersion: string;
}

export default function UpdatePolicyPanel({ appVersion }: Props) {
  const [form, setForm] = useState<PolicyData>({
    latest_version: '',
    min_supported_version: '',
    update_level: 'optional',
    reason: '',
    message: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Fetch current policy ──
  const fetchPolicy = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('update_policy')
      .select('*')
      .eq('id', 1)
      .single();

    if (data && !error) {
      setForm({
        latest_version: data.latest_version || '',
        min_supported_version: data.min_supported_version || '',
        update_level: data.update_level as UpdateLevel,
        reason: data.reason || '',
        message: data.message || '',
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPolicy(); }, [fetchPolicy]);

  // ── Validation ──
  const validate = (): boolean => {
    const e: Record<string, string> = {};

    if (!form.latest_version.trim()) {
      e.latest_version = 'Zorunlu alan';
    } else if (!SEMVER_RE.test(form.latest_version.trim())) {
      e.latest_version = 'Geçerli format: 1.4.0';
    }

    if (!form.min_supported_version.trim()) {
      e.min_supported_version = 'Zorunlu alan';
    } else if (!SEMVER_RE.test(form.min_supported_version.trim())) {
      e.min_supported_version = 'Geçerli format: 1.3.2';
    }

    if (
      SEMVER_RE.test(form.latest_version.trim()) &&
      SEMVER_RE.test(form.min_supported_version.trim()) &&
      compareSemver(form.min_supported_version.trim(), form.latest_version.trim()) > 0
    ) {
      e.min_supported_version = 'Son sürümden büyük olamaz';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Save ──
  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const { error } = await supabase
      .from('update_policy')
      .update({
        latest_version: form.latest_version.trim(),
        min_supported_version: form.min_supported_version.trim(),
        update_level: form.update_level,
        reason: form.reason.trim() || null,
        message: form.message.trim() || null,
      })
      .eq('id', 1);

    if (error) {
      showToast('error', 'Kayıt başarısız: ' + error.message);
    } else {
      showToast('success', 'Güncelleme politikası kaydedildi.');
    }
    setSaving(false);
  };

  // ── Preset ──
  const applyPreset = (level: UpdateLevel) => {
    setForm(prev => ({ ...prev, update_level: level }));
  };

  // ── Preview: current app version vs form ──
  const getPreview = (): { label: string; color: string; icon: React.ReactNode } => {
    if (!appVersion || !SEMVER_RE.test(form.latest_version) || !SEMVER_RE.test(form.min_supported_version)) {
      return { label: 'Hesaplanamıyor', color: 'text-[var(--theme-secondary-text)]/40', icon: <Info size={11} /> };
    }
    if (isBelowMin(appVersion, form.min_supported_version)) {
      return { label: 'Zorunlu güncelleme', color: 'text-red-400', icon: <Lock size={11} /> };
    }
    if (!isOutdated(appVersion, form.latest_version)) {
      return { label: 'Güncel', color: 'text-emerald-400', icon: <CheckCircle2 size={11} /> };
    }
    if (form.update_level === 'force') {
      return { label: 'Zorunlu güncelleme', color: 'text-red-400', icon: <Lock size={11} /> };
    }
    if (form.update_level === 'recommended') {
      return { label: 'Önerilen güncelleme', color: 'text-amber-400', icon: <Zap size={11} /> };
    }
    return { label: 'İsteğe bağlı güncelleme', color: 'text-[var(--theme-accent)]', icon: <Info size={11} /> };
  };

  const preview = getPreview();

  const set = (field: keyof PolicyData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  };

  if (loading) {
    return (
      <div className="py-8 text-center text-[var(--theme-secondary-text)]/40 text-xs">
        Yükleniyor...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Preset buttons */}
      <div>
        <label className={labelCls}>Hızlı Ayar</label>
        <div className="flex gap-2">
          {PRESETS.map(p => (
            <button
              key={p.level}
              type="button"
              onClick={() => applyPreset(p.level)}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 px-2 rounded-lg border text-[10px] font-medium transition-all ${
                form.update_level === p.level
                  ? p.level === 'force'
                    ? 'border-red-500/40 bg-red-500/10 text-red-400'
                    : p.level === 'recommended'
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                      : 'border-[var(--theme-accent)]/40 bg-[var(--theme-accent)]/10 text-[var(--theme-accent)]'
                  : 'border-[var(--theme-border)]/30 text-[var(--theme-secondary-text)]/60 hover:border-[var(--theme-border)]/60'
              }`}
            >
              {p.icon}
              <span className="font-bold">{p.label}</span>
              <span className="opacity-60">{p.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Version fields */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Son Sürüm</label>
          <input
            type="text"
            value={form.latest_version}
            onChange={e => set('latest_version', e.target.value)}
            placeholder="1.4.0"
            className={`${inputCls} ${errors.latest_version ? 'border-red-500/50' : ''}`}
          />
          {errors.latest_version && <p className="text-[9px] text-red-400 mt-1">{errors.latest_version}</p>}
        </div>
        <div>
          <label className={labelCls}>Minimum Desteklenen Sürüm</label>
          <input
            type="text"
            value={form.min_supported_version}
            onChange={e => set('min_supported_version', e.target.value)}
            placeholder="1.3.2"
            className={`${inputCls} ${errors.min_supported_version ? 'border-red-500/50' : ''}`}
          />
          {errors.min_supported_version && <p className="text-[9px] text-red-400 mt-1">{errors.min_supported_version}</p>}
        </div>
      </div>

      {/* Golden rule hint */}
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/5 border border-amber-500/15">
        <AlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[10px] text-amber-400/80 leading-relaxed">
          Güncelleme seviyesi ne olursa olsun, uygulama sürümü minimum desteklenen sürümün altındaysa kullanıcı zorunlu güncellemeye düşer.
        </p>
      </div>

      {/* Update level segmented */}
      <div>
        <label className={labelCls}>Güncelleme Seviyesi</label>
        <div className="flex rounded-lg border border-[var(--theme-border)]/30 overflow-hidden">
          {(['optional', 'recommended', 'force'] as const).map(level => (
            <button
              key={level}
              type="button"
              onClick={() => set('update_level', level)}
              className={`flex-1 py-2 text-[11px] font-bold transition-all ${
                form.update_level === level
                  ? level === 'force'
                    ? 'bg-red-500/15 text-red-400'
                    : level === 'recommended'
                      ? 'bg-amber-500/15 text-amber-400'
                      : 'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)]'
                  : 'text-[var(--theme-secondary-text)]/40 hover:text-[var(--theme-secondary-text)]/70 hover:bg-[var(--theme-border)]/8'
              }`}
            >
              {level === 'optional' ? 'İsteğe Bağlı' : level === 'recommended' ? 'Önerilen' : 'Zorunlu'}
            </button>
          ))}
        </div>
      </div>

      {/* Reason */}
      <div>
        <label className={labelCls}>Teknik Sebep <span className="opacity-40 normal-case">(iç kullanım)</span></label>
        <input
          type="text"
          value={form.reason}
          onChange={e => set('reason', e.target.value)}
          placeholder="critical_realtime_compat"
          className={inputCls}
        />
        <p className={hintCls}>Kullanıcıya gösterilmez. Loglama ve takip için.</p>
      </div>

      {/* Message */}
      <div>
        <label className={labelCls}>Kullanıcıya Gösterilecek Mesaj</label>
        <textarea
          value={form.message}
          onChange={e => set('message', e.target.value)}
          placeholder="Bağlantı uyumluluğu için güncelleme gereklidir."
          rows={2}
          className={`${inputCls} resize-none`}
        />
        <p className={hintCls}>Force modda overlay'de, recommended modda nudge metninde gösterilir.</p>
      </div>

      {/* Preview */}
      <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[var(--theme-bg)]/60 border border-[var(--theme-border)]/20">
        <div className="flex items-center gap-2">
          <Shield size={12} className="text-[var(--theme-secondary-text)]/30" />
          <span className="text-[10px] text-[var(--theme-secondary-text)]/50">
            Mevcut sürüm: <span className="font-bold text-[var(--theme-text)]">v{appVersion || '—'}</span>
          </span>
        </div>
        <div className={`flex items-center gap-1.5 text-[10px] font-bold ${preview.color}`}>
          {preview.icon}
          {preview.label}
        </div>
      </div>

      {/* Save */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[12px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-50"
        style={{ backgroundColor: 'var(--theme-accent)' }}
      >
        <Save size={14} />
        {saving ? 'Kaydediliyor...' : 'Politikayı Kaydet'}
      </button>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium ${
              toast.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
