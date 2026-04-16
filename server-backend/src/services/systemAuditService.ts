import { execute } from '../repositories/db';

export const SYSTEM_AUDIT_PREFIX = 'system_admin_action.';

export type SystemAuditAction =
  | 'system_admin_action.server.delete'
  | 'system_admin_action.server.ban'
  | 'system_admin_action.server.unban'
  | 'system_admin_action.server.plan_change'
  | 'system_admin_action.server.force_owner_leave'
  | 'system_admin_action.user.level_change';

export interface SystemAuditInput {
  adminUserId: string;
  action: SystemAuditAction;
  targetType: 'server' | 'profile';
  targetId: string;
  metadata?: Record<string, unknown> | null;
}

/**
 * Append-only. Her system admin aksiyonu çağırmak ZORUNDA.
 * Yazım başarısızsa exception fırlatır — çağıran yerde try/catch ile işlemi reddet.
 */
export async function writeSystemAudit(input: SystemAuditInput): Promise<void> {
  const { adminUserId, action, targetType, targetId, metadata } = input;
  if (!action.startsWith(SYSTEM_AUDIT_PREFIX)) {
    throw new Error(`[systemAudit] action prefix geçersiz: ${action}`);
  }
  await execute(
    `INSERT INTO system_audit_log (admin_user_id, action, target_type, target_id, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [adminUserId, action, targetType, targetId, metadata ? JSON.stringify(metadata) : null],
  );
}
