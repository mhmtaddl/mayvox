import { useEffect, useState } from 'react';
import { subscribe, type ToastItem } from './notificationService';

/** Toast array'e abone olur. */
export function useNotifications(): ToastItem[] {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  useEffect(() => subscribe(setToasts), []);
  return toasts;
}
