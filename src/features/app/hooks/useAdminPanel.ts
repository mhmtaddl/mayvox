/**
 * useAdminPanel — Admin şifre sıfırlama ve davet talebi yönetimi.
 * Polling + Realtime subscription + action handlers.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  getPendingPasswordResets,
  getAdminInviteRequests,
  adminSendInviteCode,
  adminMarkInviteSent,
  adminMarkInviteFailed,
  adminRejectInvite,
  sendInviteEmail,
  sendRejectionEmail,
  supabase as supabaseClient,
} from '../../../lib/supabase';
import type { ResetRequest } from '../../../components/PasswordResetPanel';
import type { InviteRequest } from '../../../types';

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

  const SERVER_URL = import.meta.env.VITE_TOKEN_SERVER_URL ?? 'https://api.mayvox.com';

  // ── Password reset polling (15sn) ──
  useEffect(() => {
    if (!currentUserId || (!isAdmin && !isPrimaryAdmin)) return;
    if (view !== 'chat' && view !== 'settings') return;

    const poll = async () => {
      const { data } = await getPendingPasswordResets();
      if (data) {
        setPasswordResetRequests(data.map((p: { id: string; name: string; email: string }) => ({
          userId: p.id,
          userName: p.name,
          userEmail: p.email,
        })));
      }
    };

    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [isAdmin, isPrimaryAdmin, view, currentUserId]);

  // ── Invite request polling (30sn) + Realtime ──
  useEffect(() => {
    if (!currentUserId || (!isAdmin && !isPrimaryAdmin)) return;
    if (view !== 'chat' && view !== 'settings') return;

    const mapRow = (r: {
      id: string; email: string; status: string; code?: string | null;
      expires_at: number; created_at: string; rejection_count: number;
      blocked_until?: number | null; permanently_blocked: boolean;
      last_send_error?: string | null;
    }): InviteRequest => ({
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

    const refreshInvites = async () => {
      const requests = await getAdminInviteRequests();
      setInviteRequests(requests.map(mapRow));
    };

    refreshInvites();
    const interval = setInterval(refreshInvites, 30000);

    const channel = supabaseClient
      .channel(`invite-requests-admin-rt-${currentUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'invite_requests' },
        (payload) => {
          const row = payload.new as {
            id: string; email: string; status: string; code?: string | null;
            expires_at: number; created_at: string;
            last_send_error?: string | null;
          };
          setInviteRequests(prev => {
            if (prev.find(r => r.id === row.id)) return prev;
            return [...prev, {
              id: row.id,
              email: row.email,
              status: row.status as InviteRequest['status'],
              expiresAt: row.expires_at,
              rejectionCount: 0,
              createdAt: row.created_at,
              lastSendError: row.last_send_error ?? undefined,
              sentCode: row.code ?? undefined,
            }];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'invite_requests' },
        (payload) => {
          const row = payload.new as {
            id: string; status: string; code?: string | null;
            last_send_error?: string | null; expires_at: number;
          };
          const actionable = ['pending', 'sending', 'failed'];
          if (!actionable.includes(row.status)) {
            setInviteRequests(prev => prev.filter(r => r.id !== row.id));
          } else {
            setInviteRequests(prev => prev.map(r =>
              r.id === row.id
                ? { ...r, status: row.status as InviteRequest['status'], lastSendError: row.last_send_error ?? undefined, sentCode: row.code ?? undefined, expiresAt: row.expires_at }
                : r,
            ));
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      channel.unsubscribe();
    };
  }, [currentUserId, isAdmin, isPrimaryAdmin, view]);

  // ── Handlers ──
  const handleApproveReset = async (req: ResetRequest) => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session?.access_token) return;

    const res = await fetch(`${SERVER_URL}/api/admin-reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
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
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session?.access_token) return;

    await fetch(`${SERVER_URL}/api/dismiss-password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
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
    const { data: pending } = await getPendingPasswordResets();
    if (pending) {
      setPasswordResetRequests(pending.map((p: { id: string; name: string; email: string }) => ({
        userId: p.id, userName: p.name, userEmail: p.email,
      })));
    }
    const adminInvites = await getAdminInviteRequests();
    if (adminInvites.length > 0) {
      setInviteRequests(adminInvites.map(r => ({
        id: r.id, email: r.email,
        status: r.status as InviteRequest['status'],
        expiresAt: r.expires_at, rejectionCount: r.rejection_count,
        blockedUntil: r.blocked_until, permanentlyBlocked: r.permanently_blocked,
        createdAt: r.created_at, lastSendError: r.last_send_error ?? undefined,
        sentCode: r.code ?? undefined,
      })));
    }
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
