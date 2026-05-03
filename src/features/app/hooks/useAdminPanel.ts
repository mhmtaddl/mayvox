/**
 * useAdminPanel — Admin şifre sıfırlama ve davet talebi yönetimi.
 * Polling + action handlers.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  getPendingPasswordResets,
  getAdminInviteRequests,
  adminSendInviteCode,
  adminMarkInviteSent,
  adminMarkInviteFailed,
  adminRejectInvite,
  sendInviteEmail,
  sendRejectionEmail,
} from '../../../lib/backendClient';
import { getAuthToken } from '../../../lib/authClient';
import type { ResetRequest } from '../../../components/PasswordResetPanel';
import type { InviteRequest } from '../../../types';

type PendingResetProfile = {
  id: string;
  name?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

const pendingResetDisplayName = (p: PendingResetProfile) => {
  const full = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
  return p.display_name || full || p.name || 'Kullanıcı';
};

type AdminInviteRequestRow = {
  id: string; email: string; status: string; code?: string | null;
  expires_at: number; created_at: string; rejection_count: number;
  blocked_until?: number | null; permanently_blocked: boolean;
  last_send_error?: string | null;
};

const ADMIN_FETCH_COOLDOWN_MS = 2_500;

const mapInviteRequestRow = (r: AdminInviteRequestRow): InviteRequest => ({
  id: r.id,
  email: r.email,
  status: r.status as InviteRequest['status'],
  expiresAt: r.expires_at,
  rejectionCount: r.rejection_count,
  blockedUntil: r.blocked_until,
  permanentlyBlocked: r.permanently_blocked,
  createdAt: r.created_at,
  lastSendError: r.last_send_error ?? undefined,
  sentCode: r.code ?? undefined,
});

interface UseAdminPanelOptions {
  currentUserId: string;
  isAdmin: boolean;
  isPrimaryAdmin: boolean;
  view: string;
  presenceChannelRef: React.MutableRefObject<any>;
  setToastMsg: (msg: string | null) => void;
}

export function useAdminPanel({
  currentUserId,
  isAdmin,
  isPrimaryAdmin,
  view,
  presenceChannelRef,
  setToastMsg,
}: UseAdminPanelOptions) {
  const [passwordResetRequests, setPasswordResetRequests] = useState<ResetRequest[]>([]);
  const [inviteRequests, setInviteRequests] = useState<InviteRequest[]>([]);
  const passwordResetsInFlightRef = useRef(false);
  const inviteRequestsInFlightRef = useRef(false);
  const lastPasswordResetsFetchAtRef = useRef(0);
  const lastInviteRequestsFetchAtRef = useRef(0);

  const SERVER_URL = import.meta.env.VITE_SERVER_API_URL;

  const loadPasswordResetRequests = useCallback(async (opts: { force?: boolean } = {}) => {
    const now = Date.now();
    if (passwordResetsInFlightRef.current) return;
    if (!opts.force && now - lastPasswordResetsFetchAtRef.current < ADMIN_FETCH_COOLDOWN_MS) return;

    passwordResetsInFlightRef.current = true;
    lastPasswordResetsFetchAtRef.current = now;
    try {
      const { data } = await getPendingPasswordResets();
      if (data) {
        setPasswordResetRequests((data as PendingResetProfile[]).map((p) => ({
          userId: p.id,
          userName: pendingResetDisplayName(p),
          userEmail: p.email || '',
        })));
      }
    } finally {
      passwordResetsInFlightRef.current = false;
    }
  }, []);

  const loadInviteRequests = useCallback(async (opts: { force?: boolean } = {}) => {
    const now = Date.now();
    if (inviteRequestsInFlightRef.current) return;
    if (!opts.force && now - lastInviteRequestsFetchAtRef.current < ADMIN_FETCH_COOLDOWN_MS) return;

    inviteRequestsInFlightRef.current = true;
    lastInviteRequestsFetchAtRef.current = now;
    try {
      const requests = await getAdminInviteRequests();
      setInviteRequests(requests.map(mapInviteRequestRow));
    } finally {
      inviteRequestsInFlightRef.current = false;
    }
  }, []);

  // ── Password reset polling (15sn) ──
  useEffect(() => {
    if (!currentUserId || (!isAdmin && !isPrimaryAdmin)) return;
    if (view !== 'chat' && view !== 'settings') return;

    const interval = setInterval(() => { void loadPasswordResetRequests(); }, 15000);
    return () => clearInterval(interval);
  }, [isAdmin, isPrimaryAdmin, view, currentUserId, loadPasswordResetRequests]);

  // ── Invite request polling (30sn) ──
  useEffect(() => {
    if (!currentUserId || (!isAdmin && !isPrimaryAdmin)) return;
    if (view !== 'chat' && view !== 'settings') return;

    void loadInviteRequests();
    const interval = setInterval(() => { void loadInviteRequests(); }, 30000);

    return () => {
      clearInterval(interval);
    };
  }, [currentUserId, isAdmin, isPrimaryAdmin, view, loadInviteRequests]);

  // ── Handlers ──
  const handleApproveReset = async (req: ResetRequest) => {
    const token = getAuthToken();
    if (!token) return;

    const res = await fetch(`${SERVER_URL}/api/admin-reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ targetUserId: req.userId }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setToastMsg(data.error ?? 'Şifre sıfırlanamadı');
      return;
    }

    setPasswordResetRequests(prev => prev.filter(r => r.userId !== req.userId));
    presenceChannelRef.current?.send({ type: 'broadcast', event: 'password-reset-update', payload: { userId: req.userId } });
  };

  const handleDismissReset = async (userId: string) => {
    const token = getAuthToken();
    if (!token) return;

    await fetch(`${SERVER_URL}/api/dismiss-password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ targetUserId: userId }),
    });

    setPasswordResetRequests(prev => prev.filter(r => r.userId !== userId));
    presenceChannelRef.current?.send({ type: 'broadcast', event: 'password-reset-update', payload: { userId } });
  };

  const handleAdminManualReset = async (userId: string, userName: string, userEmail: string) => {
    await handleApproveReset({ userId, userName, userEmail });
  };

  const handleSendInviteCode = async (req: InviteRequest): Promise<{ code?: string; error?: string }> => {
    let optimisticApplied = false;
    let lockedCode: string | undefined;
    try {
      const result = await adminSendInviteCode(req.id);
      if (result.error) {
        if (result.error === 'invalid_status') return { error: 'Bu talep zaten işleme alınmış.' };
        return { error: result.error };
      }
      if (!result.ok || !result.code) return { error: 'Kod üretilemedi.' };
      lockedCode = result.code;

      setInviteRequests(prev => prev.map(r =>
        r.id === req.id ? { ...r, status: 'sending' as const, sentCode: lockedCode } : r,
      ));
      optimisticApplied = true;

      const emailResult = await sendInviteEmail(req.email, lockedCode, result.expires_at ?? 0);

      if (emailResult.success) {
        await adminMarkInviteSent(req.id);
        setInviteRequests(prev => prev.filter(r => r.id !== req.id));
        return { code: lockedCode };
      } else {
        const errMsg = emailResult.error ?? 'E-posta gönderilemedi';
        await adminMarkInviteFailed(req.id, errMsg);
        setInviteRequests(prev => prev.map(r =>
          r.id === req.id ? { ...r, status: 'failed' as const, lastSendError: errMsg } : r,
        ));
        return { code: lockedCode, error: errMsg };
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Bilinmeyen hata';
      if (optimisticApplied) {
        setInviteRequests(prev => prev.map(r =>
          r.id === req.id ? { ...r, status: 'failed' as const, lastSendError: errMsg } : r,
        ));
        if (lockedCode) adminMarkInviteFailed(req.id, errMsg).catch(() => {});
      }
      return { error: errMsg };
    }
  };

  const handleRejectInvite = async (req: InviteRequest): Promise<void> => {
    try {
      await adminRejectInvite(req.id);
      // Red e-postası — başarısız olursa sessizce devam (DB'de zaten rejected)
      const mail = await sendRejectionEmail(req.email);
      if (!mail.success) console.warn('[reject] Red e-postası gönderilemedi:', mail.error);
    } finally {
      setInviteRequests(prev => prev.filter(r => r.id !== req.id));
    }
  };

  // Login sonrası initial load için
  const loadInitialAdminData = async () => {
    await Promise.all([
      loadPasswordResetRequests({ force: true }),
      loadInviteRequests({ force: true }),
    ]);
  };

  return {
    passwordResetRequests,
    setPasswordResetRequests,
    inviteRequests,
    setInviteRequests,
    handleApproveReset,
    handleDismissReset,
    handleAdminManualReset,
    handleSendInviteCode,
    handleRejectInvite,
    loadInitialAdminData,
  };
}
