import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Server, Search, Trash2, Ban, ShieldOff, UserMinus, Crown,
  ChevronLeft, ChevronRight, Mail, User as UserIcon, AlertTriangle,
  Check,
} from 'lucide-react';
import { CardSection, cardCls } from '../shared';
import Modal from '../../Modal';
import ConfirmModal from '../../ConfirmModal';
import { useUI } from '../../../contexts/UIContext';
import { useUser } from '../../../contexts/UserContext';
import {
  listAdminServers,
  deleteAdminServer,
  setAdminServerBanned,
  setAdminServerPlan,
  forceOwnerLeave,
  type AdminServerRow,
  type PlanKey,
  AdminApiError,
} from '../../../lib/systemAdminApi';

type ConfirmAction =
  | { type: 'delete'; server: AdminServerRow }
  | { type: 'ban'; server: AdminServerRow; banned: boolean }
  | { type: 'plan'; server: AdminServerRow; plan: PlanKey; direction: 'upgrade' | 'downgrade' | 'same' }
  | { type: 'forceOwnerLeave'; server: AdminServerRow };

const PAGE_SIZE = 20;
const PLAN_RANK: Record<PlanKey, number> = { free: 0, pro: 1, ultra: 2 };
const PLAN_LABEL: Record<PlanKey, string> = { free: 'Free', pro: 'Pro', ultra: 'Ultra' };

export default function SystemServersPanel() {
  const { setToastMsg } = useUI();
  const { currentUser } = useUser();
  const canDelete = !!currentUser.isPrimaryAdmin;
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<AdminServerRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [planPickerSrv, setPlanPickerSrv] = useState<AdminServerRow | null>(null);
  const [restrictTargetSrv, setRestrictTargetSrv] = useState<AdminServerRow | null>(null);
  const [restrictReason, setRestrictReason] = useState('');
  const [restrictLoading, setRestrictLoading] = useState(false);

  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setOffset(0);
    }, 300);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await listAdminServers({ search: debouncedSearch, limit: PAGE_SIZE, offset });
      setItems(r.items);
      setTotal(r.total);
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Sunucu listesi yüklenemedi');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, offset]);

  useEffect(() => { void load(); }, [load]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const confirmConfig = useMemo(() => {
    if (!confirmAction) return null;
    switch (confirmAction.type) {
      case 'delete':
        return {
          title: 'Sunucu Kalıcı Olarak Silinecek',
          description: `"${confirmAction.server.name}" kalıcı olarak silinecek. Tüm kanallar, üyeler, davetler, mesajlar ve ayarlar geri dönülmez şekilde temizlenecek. Bu işlem geri alınamaz.`,
          confirmText: 'Kalıcı Sil',
          danger: true,
        };
      case 'ban':
        return confirmAction.banned
          ? {
              title: 'Sunucu Kısıtlanacak (Restricted Mode)',
              description: `"${confirmAction.server.name}" sistem tarafından kısıtlanacak. Üyeler sunucuyu görmeye ve açmaya devam edecek, ancak odalara giriş ve sesli bağlantı kapatılacak. İşlem geri alınabilir.`,
              confirmText: 'Kısıtla',
              danger: true,
            }
          : {
              title: 'Kısıtlama Kaldırılacak',
              description: `"${confirmAction.server.name}" üstündeki sistem kısıtlaması kaldırılacak ve oda/sesli bağlantı erişimi yeniden açılacak.`,
              confirmText: 'Kısıtlamayı Kaldır',
              danger: false,
            };
      case 'plan': {
        const from = confirmAction.server.plan.toUpperCase();
        const to = confirmAction.plan.toUpperCase();
        if (confirmAction.direction === 'upgrade') {
          return {
            title: 'Plan Yükseltiliyor',
            description: `Bu sunucuyu ${PLAN_LABEL[confirmAction.plan]} planına yükseltiyorsunuz (${from} → ${to}). Onaylıyor musunuz?`,
            confirmText: 'Yükselt',
            danger: false,
          };
        }
        if (confirmAction.direction === 'downgrade') {
          return {
            title: 'Plan Düşürülüyor',
            description: `Bu sunucuyu ${PLAN_LABEL[confirmAction.plan]} planına düşürüyorsunuz (${from} → ${to}). Mevcut kanal/üye sayısı yeni planın limitlerini aşıyorsa bazı özellikler kullanılamayabilir. Onaylıyor musunuz?`,
            confirmText: 'Düşür',
            danger: true,
          };
        }
        return {
          title: 'Plan Onayı',
          description: `Bu sunucunun planı zaten ${to}. Yine de güncellemek istiyor musunuz?`,
          confirmText: 'Güncelle',
          danger: false,
        };
      }
      case 'forceOwnerLeave':
        return {
          title: 'Owner Zorla Çıkarılacak',
          description: `"${confirmAction.server.name}" sahibi sunucunun üyeliğinden zorla çıkarılacak. Kalan en yüksek rütbeli üye (varsa) yeni owner olarak atanacak; kimse kalmazsa sunucu sahipsiz duruma düşer. Bu işlem geri alınamaz; eski owner dilerse tekrar davet edilebilir.`,
          confirmText: 'Owner\'ı Çıkar',
          danger: true,
        };
    }
  }, [confirmAction]);

  const runConfirm = useCallback(async () => {
    if (!confirmAction) return;
    setConfirmLoading(true);
    try {
      switch (confirmAction.type) {
        case 'delete':
          await deleteAdminServer(confirmAction.server.id);
          setToastMsg(`Sunucu silindi: ${confirmAction.server.name}`);
          break;
        case 'ban':
          await setAdminServerBanned(confirmAction.server.id, confirmAction.banned);
          setToastMsg(confirmAction.banned ? 'Sunucu kısıtlandı' : 'Kısıtlama kaldırıldı');
          break;
        case 'plan':
          await setAdminServerPlan(confirmAction.server.id, confirmAction.plan);
          setToastMsg(`Plan güncellendi: ${PLAN_LABEL[confirmAction.plan]}`);
          break;
        case 'forceOwnerLeave': {
          const r = await forceOwnerLeave(confirmAction.server.id);
          setToastMsg(r.newOwnerId ? 'Owner çıkarıldı, yeni owner atandı' : 'Owner çıkarıldı (sunucu sahipsiz)');
          break;
        }
      }
      setConfirmAction(null);
      await load();
    } catch (e) {
      setToastMsg(e instanceof AdminApiError ? e.message : 'İşlem başarısız');
    } finally {
      setConfirmLoading(false);
    }
  }, [confirmAction, load, setToastMsg]);

  return (
    <>
      <CardSection
        icon={<Server size={12} />}
        title="Sistem — Tüm Sunucular"
        subtitle={loading ? 'yükleniyor...' : `${total} sunucu`}
      >
        {/* Search */}
        <div className="relative mb-3">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]/50" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Sunucu adı veya owner ID ile ara..."
            className="w-full bg-[var(--theme-input-bg)] border border-[var(--theme-input-border)] rounded-xl pl-9 pr-3 py-2 md:py-2.5 text-[12px] md:text-[13px] focus:border-[var(--theme-accent)]/50 focus:ring-2 focus:ring-[var(--theme-accent)]/15 outline-none transition-all text-[var(--theme-input-text)] placeholder:text-[var(--theme-input-placeholder)]"
          />
        </div>

        {error && (
          <div className="p-3 mb-3 bg-red-500/10 border border-red-500/25 rounded-lg text-red-400 text-[12px] flex items-start gap-2">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold">Liste yüklenemedi</div>
              <div className="opacity-80">{error}</div>
              <button onClick={() => void load()} className="mt-1 underline hover:opacity-100 opacity-90">Yeniden dene</button>
            </div>
          </div>
        )}

        <div className={`${cardCls}`}>
          {loading && !items ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 border-[var(--theme-accent)]/30 border-t-[var(--theme-accent)] rounded-full animate-spin" />
            </div>
          ) : !items || items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-[var(--theme-secondary-text)]">
              <Server size={24} className="opacity-30 mb-2" />
              <p className="text-[12px] font-medium">Sunucu bulunamadı</p>
              {debouncedSearch && <p className="text-[10px] opacity-60 mt-1">"{debouncedSearch}" için sonuç yok</p>}
            </div>
          ) : (
            <div className="divide-y divide-[var(--theme-border)]">
              {items.map(srv => (
                <ServerRow
                  key={srv.id}
                  srv={srv}
                  canDelete={canDelete}
                  onDelete={() => setConfirmAction({ type: 'delete', server: srv })}
                  onBanToggle={() => {
                    if (srv.is_banned) {
                      setConfirmAction({ type: 'ban', server: srv, banned: false });
                    } else {
                      setRestrictTargetSrv(srv);
                      setRestrictReason('');
                    }
                  }}
                  onOpenPlanPicker={() => setPlanPickerSrv(srv)}
                  onForceLeave={() => setConfirmAction({ type: 'forceOwnerLeave', server: srv })}
                />
              ))}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-3 px-1">
            <span className="text-[11px] text-[var(--theme-secondary-text)]/70">Sayfa {page} / {totalPages}</span>
            <div className="flex items-center gap-1">
              <button
                disabled={offset <= 0 || loading}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                className="p-1.5 rounded-lg hover:bg-[var(--theme-panel-hover)] disabled:opacity-30 disabled:cursor-default"
                aria-label="Önceki sayfa"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                disabled={offset + PAGE_SIZE >= total || loading}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="p-1.5 rounded-lg hover:bg-[var(--theme-panel-hover)] disabled:opacity-30 disabled:cursor-default"
                aria-label="Sonraki sayfa"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </CardSection>

      {confirmConfig && (
        <ConfirmModal
          isOpen={!!confirmAction}
          title={confirmConfig.title}
          description={confirmConfig.description}
          confirmText={confirmConfig.confirmText}
          cancelText="Vazgeç"
          onConfirm={runConfirm}
          onCancel={() => setConfirmAction(null)}
          danger={confirmConfig.danger}
          loading={confirmLoading}
        />
      )}

      {restrictTargetSrv && (
        <RestrictReasonModal
          server={restrictTargetSrv}
          reason={restrictReason}
          onReasonChange={setRestrictReason}
          loading={restrictLoading}
          onClose={() => { setRestrictTargetSrv(null); setRestrictReason(''); }}
          onConfirm={async () => {
            const trimmed = restrictReason.trim();
            if (trimmed.length < 5) return;
            setRestrictLoading(true);
            try {
              await setAdminServerBanned(restrictTargetSrv.id, true, trimmed);
              setToastMsg('Sunucu kısıtlandı, owner açıklamayı görebilir');
              setRestrictTargetSrv(null);
              setRestrictReason('');
              await load();
            } catch (e) {
              setToastMsg(e instanceof AdminApiError ? e.message : 'Kısıtlama başarısız');
            } finally {
              setRestrictLoading(false);
            }
          }}
        />
      )}

      {planPickerSrv && (
        <PlanPickerModal
          server={planPickerSrv}
          onClose={() => setPlanPickerSrv(null)}
          onSelect={(plan) => {
            const srv = planPickerSrv;
            const direction: 'upgrade' | 'downgrade' | 'same' =
              PLAN_RANK[plan] > PLAN_RANK[srv.plan] ? 'upgrade'
              : PLAN_RANK[plan] < PLAN_RANK[srv.plan] ? 'downgrade'
              : 'same';
            setPlanPickerSrv(null);
            setConfirmAction({ type: 'plan', server: srv, plan, direction });
          }}
        />
      )}
    </>
  );
}

// ── Row ──
interface RowProps {
  srv: AdminServerRow;
  canDelete: boolean;
  onDelete: () => void;
  onBanToggle: () => void;
  onOpenPlanPicker: () => void;
  onForceLeave: () => void;
}

const ServerRow: React.FC<RowProps> = ({ srv, canDelete, onDelete, onBanToggle, onOpenPlanPicker, onForceLeave }) => {
  const ownerName = srv.owner_display_name || srv.owner_full_name || '—';
  const ownerEmail = srv.owner_email || '—';
  const avatarHttp = srv.avatar_url && srv.avatar_url.startsWith('http') ? srv.avatar_url : null;
  const avatarFallback = (srv.short_name || srv.name || 'S').slice(0, 2).toUpperCase();

  return (
    <div className={`flex items-start gap-3 px-3 py-3 hover:bg-[var(--theme-panel-hover)] transition-colors ${srv.is_banned ? 'bg-red-500/[0.04]' : ''}`}>
      {/* Server avatar */}
      <div className="shrink-0 w-9 h-9 rounded-xl bg-[var(--theme-accent)]/12 text-[var(--theme-accent)] font-bold text-[12px] flex items-center justify-center overflow-hidden">
        {avatarHttp ? <img src={avatarHttp} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : avatarFallback}
      </div>
      {/* Meta */}
      <div className="flex-1 min-w-0">
        {/* Server header */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-semibold truncate text-[var(--theme-text)]">{srv.name}</span>
          {srv.is_banned && (
            <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 text-[9px] font-bold uppercase tracking-wide">
              <Ban size={8} /> kısıtlı
            </span>
          )}
          <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
            srv.plan === 'ultra' ? 'bg-violet-500/15 text-violet-400'
            : srv.plan === 'pro' ? 'bg-sky-500/15 text-sky-400'
            : 'bg-white/5 text-[var(--theme-secondary-text)]'
          }`}>
            {srv.plan}
          </span>
        </div>

        {/* Server meta line */}
        <div className="flex items-center gap-3 mt-0.5 text-[10.5px] text-[var(--theme-secondary-text)]/75">
          <span>{srv.member_count} üye</span>
          <span>{new Date(srv.created_at).toLocaleDateString('tr-TR')}</span>
        </div>

        {/* Owner block */}
        <div className="mt-1.5 pl-2 border-l-2 border-[var(--theme-border)]/60 space-y-0.5">
          <div className="flex items-center gap-1.5 text-[10.5px] text-[var(--theme-secondary-text)]">
            <UserIcon size={10} className="opacity-60" />
            <span className="font-semibold text-[var(--theme-text)]/90 truncate" title={ownerName}>{ownerName}</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-[var(--theme-secondary-text)]/75">
            <span className="inline-flex items-center gap-1 min-w-0 truncate" title={ownerEmail}>
              <Mail size={9} className="opacity-60 shrink-0" />
              <span className="truncate">{ownerEmail}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 pt-0.5">
        <button
          onClick={onOpenPlanPicker}
          className="p-1.5 rounded-lg hover:bg-[var(--theme-panel-hover)] text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] transition-colors"
          title="Planı değiştir"
          aria-label="Planı değiştir"
        >
          <Crown size={13} />
        </button>

        <button
          onClick={onBanToggle}
          className={`p-1.5 rounded-lg hover:bg-[var(--theme-panel-hover)] transition-colors ${
            srv.is_banned
              ? 'text-emerald-400 hover:bg-emerald-500/10'
              : 'text-[var(--theme-secondary-text)] hover:text-orange-400'
          }`}
          title={srv.is_banned ? 'Kısıtlamayı kaldır (oda erişimini geri aç)' : 'Sunucuyu kısıtla (oda/sesli erişimi kapat)'}
          aria-label={srv.is_banned ? 'Kısıtlamayı kaldır' : 'Sunucuyu kısıtla'}
        >
          {srv.is_banned ? <ShieldOff size={13} /> : <Ban size={13} />}
        </button>

        <button
          onClick={onForceLeave}
          className="p-1.5 rounded-lg hover:bg-[var(--theme-panel-hover)] text-[var(--theme-secondary-text)] hover:text-yellow-400 transition-colors"
          title="Owner'ı zorla çıkar (üyelikten düşür; en yüksek rütbeli üye yeni owner olur)"
          aria-label="Owner'ı zorla çıkar"
        >
          <UserMinus size={13} />
        </button>

        {canDelete && (
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-red-500/15 text-[var(--theme-secondary-text)] hover:text-red-400 transition-colors"
            title="Sunucuyu kalıcı olarak sil (tüm veri kaybolur)"
            aria-label="Sunucuyu sil"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
};

// ── Restrict Reason Modal — admin owner'a görünür açıklama girer ──

function RestrictReasonModal({ server, reason, onReasonChange, loading, onClose, onConfirm }: {
  server: AdminServerRow;
  reason: string;
  onReasonChange: (v: string) => void;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const trimmed = reason.trim();
  const valid = trimmed.length >= 5;
  return (
    <Modal open={true} onClose={loading ? () => {} : onClose} width="md" padded={false} danger>
      <div className="p-5 border-b border-[var(--theme-border)]">
        <h3 className="text-[15px] font-bold text-[var(--theme-text)] flex items-center gap-2">
          <Ban size={15} className="text-orange-400" /> Sunucuyu Kısıtla
        </h3>
        <p className="text-[12px] text-[var(--theme-secondary-text)] mt-1">
          <span className="font-semibold text-[var(--theme-text)]">{server.name}</span> sistem tarafından geçici olarak kısıtlanacak.
        </p>
      </div>

      <div className="p-5 space-y-4">
        <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/25 text-[11.5px] text-[var(--theme-text)]/85 leading-relaxed space-y-1">
          <p>· Üyeler sunucuyu görmeye ve açmaya devam eder</p>
          <p>· Odalara giriş ve sesli bağlantı kapatılır</p>
          <p>· Owner, ayarlar panelinde bu açıklamayı görür</p>
          <p>· İşlem her zaman geri alınabilir</p>
        </div>

        <div>
          <label className="block text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/85 mb-1.5">
            Açıklama (owner'a görünür) <span className="text-red-400">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => onReasonChange(e.target.value.slice(0, 500))}
            placeholder="Örn: Topluluk kurallarının ihlali nedeniyle inceleme sürüyor. Ek bilgi için destek ekibimizle iletişime geçin."
            rows={4}
            disabled={loading}
            className="w-full bg-[var(--theme-input-bg)] border border-[var(--theme-input-border)] rounded-lg px-3 py-2 text-[12px] outline-none focus:border-[var(--theme-accent)]/50 resize-none text-[var(--theme-input-text)] placeholder:text-[var(--theme-input-placeholder)]"
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className={`text-[10px] ${trimmed.length < 5 ? 'text-red-400' : 'text-[var(--theme-secondary-text)]/60'}`}>
              {trimmed.length < 5 ? 'En az 5 karakter girilmeli' : 'Açıklama owner için kalıcı olarak kaydedilir'}
            </span>
            <span className="text-[10px] text-[var(--theme-secondary-text)]/50 tabular-nums">{reason.length}/500</span>
          </div>
        </div>
      </div>

      <div className="flex border-t border-[var(--theme-border)]">
        <button
          onClick={onClose}
          disabled={loading}
          className="flex-1 py-3.5 text-[13px] font-semibold text-[var(--theme-secondary-text)] hover:bg-[var(--theme-panel-hover)] disabled:opacity-40"
        >
          Vazgeç
        </button>
        <div className="w-px bg-[var(--theme-border)]" />
        <button
          onClick={onConfirm}
          disabled={!valid || loading}
          className="flex-1 py-3.5 text-[13px] font-bold text-orange-400 hover:bg-orange-500/10 disabled:opacity-40 disabled:cursor-default"
        >
          {loading ? 'Kısıtlanıyor...' : 'Kısıtla'}
        </button>
      </div>
    </Modal>
  );
}

// ── Plan Picker Modal — 3 cards side by side ──

function PlanPickerModal({ server, onClose, onSelect }: {
  server: AdminServerRow;
  onClose: () => void;
  onSelect: (plan: PlanKey) => void;
}) {
  const PLAN_DESC: Record<PlanKey, string> = {
    free: '100 üye · 4 sistem · 2 özel',
    pro: '250 üye · 4 sistem · 5 özel',
    ultra: '1000 üye · 4 sistem · 16 özel',
  };
  const PLAN_TONE: Record<PlanKey, { ring: string; bg: string; text: string }> = {
    free: { ring: 'border-emerald-500/40', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
    pro: { ring: 'border-sky-500/40', bg: 'bg-sky-500/10', text: 'text-sky-400' },
    ultra: { ring: 'border-violet-500/40', bg: 'bg-violet-500/10', text: 'text-violet-400' },
  };

  return (
    <Modal open={true} onClose={onClose} width="md" padded={false}>
      <div className="p-5 border-b border-[var(--theme-border)]">
        <h3 className="text-[15px] font-bold text-[var(--theme-text)]">Plan Değiştir</h3>
        <p className="text-[12px] text-[var(--theme-secondary-text)] mt-0.5 truncate">{server.name}</p>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-3 gap-3">
          {(['free', 'pro', 'ultra'] as PlanKey[]).map(p => {
            const isCurrent = p === server.plan;
            const tone = PLAN_TONE[p];
            return (
              <button
                key={p}
                onClick={() => onSelect(p)}
                className={`relative flex flex-col items-center text-center px-3 py-4 rounded-xl border-2 transition-all hover:-translate-y-0.5 ${
                  isCurrent
                    ? `${tone.ring} ${tone.bg} shadow-[0_4px_16px_rgba(0,0,0,0.12)]`
                    : 'border-[var(--theme-border)] hover:border-[var(--theme-accent)]/50 bg-[var(--theme-surface-card)]'
                }`}
              >
                {isCurrent && (
                  <span className="absolute top-2 right-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8.5px] font-bold uppercase tracking-wide bg-[var(--theme-accent)]/15 text-[var(--theme-accent)]">
                    <Check size={9} strokeWidth={3} /> Mevcut
                  </span>
                )}
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${tone.bg}`}>
                  <Crown size={16} className={tone.text} />
                </div>
                <div className={`text-[14px] font-bold tracking-tight ${tone.text}`}>{PLAN_LABEL[p]}</div>
                <div className="mt-1 text-[10.5px] text-[var(--theme-secondary-text)] leading-tight">{PLAN_DESC[p]}</div>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[10.5px] text-[var(--theme-secondary-text)]/70 text-center">
          Plan seçildikten sonra onay ekranı görüntülenir; anında uygulanmaz.
        </p>
      </div>

      <div className="flex border-t border-[var(--theme-border)]">
        <button onClick={onClose} className="flex-1 py-3.5 text-[13px] font-semibold text-[var(--theme-secondary-text)] hover:bg-[var(--theme-panel-hover)]">
          Vazgeç
        </button>
      </div>
    </Modal>
  );
}
