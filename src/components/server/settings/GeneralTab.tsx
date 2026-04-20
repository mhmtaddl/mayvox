import React, { useState, useRef } from 'react';
import { X, Save, Trash2, Camera, Copy } from 'lucide-react';
import { type Server } from '../../../lib/serverService';
import { uploadServerLogo } from '../../../lib/supabase';
import AvatarCropModal from '../../AvatarCropModal';
import { IC, IC2, SettingsCard, DangerSection, Fld, Pill, fmtDate } from './shared';

interface Props {
  server: Server;
  canEdit: boolean;
  isOwner: boolean;
  onSave: (u: Record<string, unknown>) => Promise<void>;
  onDelete: () => Promise<void>;
  onLeave: () => Promise<void>;
  showToast: (m: string) => void;
}

// ══════════════════════════════════════
// GENEL — 2 kolon kompakt
// ══════════════════════════════════════
export default function GeneralTab({ server, canEdit, isOwner, onSave, onDelete, onLeave, showToast }: Props) {
  const [name, setName] = useState(server.name);
  const [desc, setDesc] = useState(server.description);
  const [motto, setMotto] = useState(server.motto ?? '');
  const [isPublic, setIsPublic] = useState(server.isPublic ?? true);
  const [joinPolicy, setJoinPolicy] = useState(server.joinPolicy ?? 'invite_only');
  const [saving, setSaving] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [leaveModal, setLeaveModal] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [logoLoading, setLogoLoading] = useState(false);

  // Otomatik slug — backend `generateBaseSlug` ile paralel: max 6 karakter, no hyphen.
  // Not: gerçek çakışma suffix'ini (1, 2, 3...) yalnız backend kararlaştırır; bu preview
  // sadece base'i gösterir.
  const autoSlug = name.trim().toLowerCase()
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 6);

  const dirty = name !== server.name || desc !== server.description || motto !== (server.motto ?? '') || isPublic !== (server.isPublic ?? true) || joinPolicy !== (server.joinPolicy ?? 'invite_only');

  const save = async () => {
    if (!dirty || saving) return;
    const trimmedName = name.trim();
    if (trimmedName.length < 3 || trimmedName.length > 15) { showToast('Sunucu adı 3-15 karakter olmalı'); return; }
    setSaving(true);
    const u: Record<string, unknown> = {};
    if (trimmedName !== server.name) u.name = trimmedName;
    if (desc !== server.description) u.description = desc.trim();
    if (motto !== (server.motto ?? '')) u.motto = motto.trim();
    if (isPublic !== (server.isPublic ?? true)) u.isPublic = isPublic;
    if (joinPolicy !== (server.joinPolicy ?? 'invite_only')) u.joinPolicy = joinPolicy;
    await onSave(u); setSaving(false);
  };

  return (
    <div className="space-y-5">
      {/* ═════ Card 1 — Sunucu Kimliği ═════ */}
      <SettingsCard title="Sunucu Kimliği" hint="Görünür isim, adres ve tanıtım metinleri">
        <div className="flex items-start gap-5">
          <div className="relative w-16 h-16 rounded-2xl overflow-hidden cursor-pointer group shrink-0"
            style={{ background: server.avatarUrl ? 'none' : 'rgba(var(--theme-accent-rgb), 0.08)', border: server.avatarUrl ? '1px solid rgba(var(--glass-tint),0.10)' : '2px dashed rgba(var(--theme-accent-rgb), 0.18)' }}
            onClick={() => canEdit && logoRef.current?.click()}>
            {server.avatarUrl ? <img src={server.avatarUrl} alt="" className="w-16 h-16 object-cover" /> : <span className="flex items-center justify-center w-16 h-16 text-[20px] font-bold text-[var(--theme-accent)]/55">{server.shortName}</span>}
            {canEdit && <div className="absolute inset-0 bg-black/55 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">{logoLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Camera size={16} className="text-white" />}</div>}
            <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (!f) return; e.target.value = ''; if (f.size > 5 * 1024 * 1024) { showToast('Maks 5 MB'); return; } const r = new FileReader(); r.onload = () => setCropSrc(r.result as string); r.readAsDataURL(f); }} />
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <Fld label="Sunucu Adı" off={!canEdit}>
              <input value={name} onChange={e => setName(e.target.value)} maxLength={15} disabled={!canEdit} className={IC} />
            </Fld>
            {(() => {
              const nameChanged = name.trim() !== server.name;
              const realSlug = (server.slug || '').replace(/\.mv$/, '');
              const shown = nameChanged ? autoSlug : (realSlug || autoSlug);
              return (
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl" style={{ background: 'rgba(var(--theme-accent-rgb), 0.05)', border: '1px solid rgba(var(--theme-accent-rgb), 0.12)' }}>
                  <span className="text-[8.5px] font-bold text-[var(--theme-secondary-text)]/55 uppercase tracking-[0.16em] shrink-0">Adres</span>
                  <span className="text-[12px] font-mono font-semibold text-[var(--theme-accent)] flex-1 truncate">{shown || '...'}<span className="opacity-55">.mv</span>{nameChanged && <span className="opacity-50 ml-1 not-italic">(önizleme)</span>}</span>
                  <button onClick={() => { navigator.clipboard.writeText((shown || '') + '.mv'); showToast('Adres kopyalandı'); }} className="text-[var(--theme-secondary-text)]/45 hover:text-[var(--theme-accent)] transition-colors shrink-0" aria-label="Adresi kopyala"><Copy size={12} /></button>
                </div>
              );
            })()}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <Fld label="Açıklama" off={!canEdit}>
            <input value={desc} onChange={e => setDesc(e.target.value)} maxLength={200} disabled={!canEdit} placeholder="Kısa açıklama" className={IC} />
          </Fld>
          <Fld label="Motto" off={!canEdit}>
            <input value={motto} onChange={e => setMotto(e.target.value.slice(0, 15))} maxLength={15} disabled={!canEdit} placeholder="voice & chat" className={IC} />
          </Fld>
        </div>
      </SettingsCard>

      {/* ═════ Card 2 — Erişim ═════ */}
      <SettingsCard title="Erişim" hint="Sunucunun nasıl bulunabildiği ve katılım kuralları">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Fld label="Görünürlük" off={!canEdit}>
            <div className="flex gap-2">
              <Pill a={isPublic} o={() => canEdit && setIsPublic(true)}>Açık</Pill>
              <Pill a={!isPublic} o={() => canEdit && setIsPublic(false)}>Gizli</Pill>
            </div>
          </Fld>
          <Fld label="Katılım" off={!canEdit}>
            <div className="flex gap-2">
              <Pill a={joinPolicy === 'invite_only'} o={() => canEdit && setJoinPolicy('invite_only')}>Davetli</Pill>
              <Pill a={joinPolicy === 'open'} o={() => canEdit && setJoinPolicy('open')}>Açık</Pill>
            </div>
          </Fld>
        </div>
      </SettingsCard>

      {/* ═════ Card 3 — Plan / Kapasite Özeti ═════ */}
      <SettingsCard title="Plan ve Kapasite" hint={server.plan === 'ultra' ? 'Maksimum tier' : 'Detay ve plan değişikliği için Özet sekmesini incele'}>
        <div className="grid grid-cols-3 gap-3">
          <IC2 label="Plan" value={(server.plan ?? 'free').toUpperCase()} accent />
          <IC2 label="Üye Kapasitesi" value={String(server.capacity)} />
          <IC2 label="Kuruluş" value={fmtDate(server.createdAt)} small />
        </div>
      </SettingsCard>

      {/* Kaydet */}
      {canEdit && dirty && (
        <div className="flex justify-end">
          <button onClick={save} disabled={saving} className="flex items-center gap-2 h-10 px-5 rounded-xl text-[12.5px] font-semibold disabled:opacity-40 transition-all hover:opacity-90 shadow-[0_4px_14px_rgba(var(--theme-accent-rgb),0.25)]" style={{ background: 'var(--theme-accent)', color: 'var(--theme-text-on-accent, #000)' }}>
            <Save size={14} /> {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
          </button>
        </div>
      )}

      {/* ═════ Tehlikeli Bölge ═════ */}
      <DangerSection>
        {isOwner ? (
          <div className="p-4 rounded-xl flex items-center justify-between gap-4"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.30)' }}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
                <Trash2 size={16} className="text-red-400" />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-red-300">Sunucuyu Sil</div>
                <div className="text-[11px] text-[var(--theme-text)]/85 mt-0.5 leading-snug">Bu işlem geri alınamaz. Tüm kanallar, üyeler, mesajlar ve davetler kalıcı olarak silinir.</div>
              </div>
            </div>
            <button onClick={() => setDeleteModal(true)} className="h-10 px-5 rounded-xl text-[12px] font-bold bg-red-500/85 text-white hover:bg-red-500 border border-red-400/40 shadow-[0_4px_14px_rgba(239,68,68,0.30)] transition-colors shrink-0">
              Sil
            </button>
          </div>
        ) : (
          <div className="p-4 rounded-xl flex items-center justify-between gap-4"
            style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.20)' }}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
                <X size={16} className="text-red-400" />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-[var(--theme-text)]">Sunucudan Ayrıl</div>
                <div className="text-[11px] text-[var(--theme-text)]/75 mt-0.5 leading-snug">Üyelik ve rollerin kaldırılır. Tekrar katılmak için davet gerekir.</div>
              </div>
            </div>
            <button onClick={() => setLeaveModal(true)} className="h-10 px-5 rounded-xl text-[12px] font-bold bg-red-500/15 text-red-300 hover:bg-red-500/25 border border-red-400/30 transition-colors shrink-0">
              Ayrıl
            </button>
          </div>
        )}
      </DangerSection>

      {/* Silme onay modal */}
      {deleteModal && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setDeleteModal(false)}>
          <div className="w-[340px] rounded-2xl p-5" onClick={e => e.stopPropagation()} style={{ background: 'rgba(var(--theme-bg-rgb, 6,10,20), 0.97)', border: '1px solid rgba(239,68,68,0.12)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
            <h3 className="text-[13px] font-bold text-red-400 mb-1">Sunucuyu Sil</h3>
            <p className="text-[10px] text-[var(--theme-secondary-text)]/45 mb-4"><strong className="text-[var(--theme-text)]">{server.name}</strong> ve tüm verileri kalıcı olarak silinecek.</p>
            <label className="block text-[9px] font-semibold text-[var(--theme-secondary-text)]/35 uppercase tracking-wider mb-1">Onay için sunucu adını yaz</label>
            <input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder={server.name} className={IC + ' !border-red-500/15 mb-3'} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setDeleteModal(false); setDeleteConfirm(''); }} className="h-8 px-3 rounded-lg text-[10px] font-semibold text-[var(--theme-secondary-text)]" style={{ background: 'rgba(var(--glass-tint), 0.06)' }}>Vazgeç</button>
              <button onClick={async () => { setDeleting(true); await onDelete(); }} disabled={deleteConfirm !== server.name || deleting} className="h-8 px-3 rounded-lg text-[10px] font-bold bg-red-500 text-white hover:bg-red-600 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">{deleting ? 'Siliniyor...' : 'Kalıcı Olarak Sil'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Ayrılma onay modal */}
      {leaveModal && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setLeaveModal(false)}>
          <div className="w-[340px] rounded-2xl p-5" onClick={e => e.stopPropagation()} style={{ background: 'rgba(var(--theme-bg-rgb, 6,10,20), 0.97)', border: '1px solid rgba(239,68,68,0.12)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
            <h3 className="text-[13px] font-bold text-red-400 mb-1">Sunucudan Ayrıl</h3>
            <p className="text-[10px] text-[var(--theme-secondary-text)]/55 mb-4"><strong className="text-[var(--theme-text)]">{server.name}</strong> sunucusundan ayrılmak istediğinden emin misin? Tekrar katılmak için davet gerekir.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setLeaveModal(false)} className="h-8 px-3 rounded-lg text-[10px] font-semibold text-[var(--theme-secondary-text)]" style={{ background: 'rgba(var(--glass-tint), 0.06)' }}>Vazgeç</button>
              <button onClick={async () => { setLeaving(true); try { await onLeave(); } finally { setLeaving(false); } }} disabled={leaving} className="h-8 px-3 rounded-lg text-[10px] font-bold bg-red-500 text-white hover:bg-red-600 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">{leaving ? 'Ayrılıyor...' : 'Ayrıl'}</button>
            </div>
          </div>
        </div>
      )}

      {cropSrc && <AvatarCropModal imageSrc={cropSrc} onCancel={() => setCropSrc(null)} onConfirm={async blob => {
        setCropSrc(null); setLogoLoading(true);
        try { const url = await uploadServerLogo(server.id, new File([blob], 'logo.jpg', { type: 'image/jpeg' })); await onSave({ avatarUrl: url }); showToast('Logo güncellendi'); }
        catch { showToast('Logo yüklenemedi'); } finally { setLogoLoading(false); }
      }} />}
    </div>
  );
}
