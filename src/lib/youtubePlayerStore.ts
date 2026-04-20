/**
 * In-app YouTube player — aktif video tekilliği için modül-seviye küçük store.
 *
 * React Context yerine bilinçli tercih: provider wrap'i yok, API sade,
 * mount-order bağımsız. Sadece lokal render state tutar — hiçbir ağ/room
 * broadcast yok (kullanıcı-lokal davranış).
 *
 * Kurallar:
 *  - Aynı anda bir video aktif (başkası açılırsa eski kapanır).
 *  - setActive(null) → player kapanır, preview card geri döner.
 */

import { useEffect, useState } from 'react';

type Listener = (id: string | null) => void;

let activeId: string | null = null;
const listeners = new Set<Listener>();

export function setActiveYouTubeId(id: string | null): void {
  if (activeId === id) return;
  activeId = id;
  listeners.forEach((l) => l(id));
}

export function getActiveYouTubeId(): string | null {
  return activeId;
}

export function subscribeYouTubeActive(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** React hook — aktif videoId'yi okur, componentinin o video olup olmadığını test etmesi için. */
export function useActiveYouTubeId(): string | null {
  const [id, setId] = useState<string | null>(activeId);
  useEffect(() => subscribeYouTubeActive(setId), []);
  return id;
}
