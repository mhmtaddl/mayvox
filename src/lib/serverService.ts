/**
 * MAYVOX Server Service
 * Sunucu CRUD + keşif işlemleri.
 * Şimdilik mock — ileride Hetzner API'ye bağlanacak.
 *
 * Her request Authorization: Bearer <supabase_access_token> ile gidecek.
 */

import { supabase } from './supabase';

export interface Server {
  id: string;
  name: string;
  shortName: string;
  avatarUrl?: string;
  description: string;
  memberCount: number;
  activeCount: number;
  capacity: number;
  level: number;
  createdAt: string;
}

// ── Hetzner API base URL (ileride env'den gelecek) ──
const API_BASE = import.meta.env.VITE_SERVER_API_URL || '';

/** Auth header — Supabase access token */
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

// ── Mock veri — API hazır olunca kaldırılacak ──
const MOCK_SERVERS: Server[] = [
  { id: 'main', name: 'MAYVOX', shortName: 'MV', description: 'Ana sunucu', memberCount: 24, activeCount: 8, capacity: 100, level: 3, createdAt: '2025-01-15' },
  { id: 'demo1', name: 'Test Sunucu', shortName: 'TS', description: 'Geliştirme ortamı', memberCount: 3, activeCount: 1, capacity: 20, level: 1, createdAt: '2026-03-01' },
  { id: 'demo2', name: 'Müzik Evi', shortName: 'ME', description: 'Canlı müzik dinle', memberCount: 45, activeCount: 12, capacity: 80, level: 2, createdAt: '2025-06-10' },
  { id: 'demo3', name: 'Oyun Dünyası', shortName: 'OD', description: 'Oyun sohbetleri', memberCount: 156, activeCount: 34, capacity: 200, level: 4, createdAt: '2025-03-22' },
  { id: 'demo4', name: 'Kod Atölyesi', shortName: 'KA', description: 'Yazılım topluluğu', memberCount: 67, activeCount: 15, capacity: 150, level: 3, createdAt: '2025-09-01' },
  { id: 'demo5', name: 'Sanat Köşesi', shortName: 'SK', description: 'Sanat ve tasarım', memberCount: 28, activeCount: 5, capacity: 50, level: 1, createdAt: '2026-01-14' },
];

const MOCK_DISCOVER: Omit<Server, 'level' | 'createdAt' | 'activeCount' | 'capacity'>[] = [
  { id: 'd0', name: 'Test Sunucu', shortName: 'TS', description: 'Deneme amaçlı sunucu', memberCount: 5 },
  { id: 'd1', name: 'Müzik Odası', shortName: 'MO', description: 'Canlı müzik dinle', memberCount: 89 },
  { id: 'd2', name: 'Oyuncular', shortName: 'OY', description: 'Oyun sohbetleri', memberCount: 156 },
  { id: 'd3', name: 'Yazılımcılar', shortName: 'YZ', description: 'Kod ve kariyer', memberCount: 42 },
];

const USE_MOCK = !API_BASE;

/**
 * Kullanıcının dahil olduğu sunucuları listele.
 */
export async function listMyServers(): Promise<Server[]> {
  if (USE_MOCK) return []; // Varsayılan: boş — Hetzner bağlanınca gerçek veri gelecek

  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/servers/my`, { headers });
  if (!res.ok) throw new Error('Sunucu listesi alınamadı');
  return res.json();
}

/**
 * Yeni sunucu oluştur.
 */
export async function createServer(name: string, description: string): Promise<Server> {
  if (USE_MOCK) {
    const newServer: Server = {
      id: `srv_${Date.now()}`, name, shortName: name.slice(0, 2).toUpperCase(),
      description, memberCount: 1, activeCount: 1, capacity: 50, level: 1,
      createdAt: new Date().toISOString().split('T')[0],
    };
    MOCK_SERVERS.push(newServer);
    return newServer;
  }

  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/servers`, {
    method: 'POST', headers, body: JSON.stringify({ name, description }),
  });
  if (!res.ok) throw new Error('Sunucu oluşturulamadı');
  return res.json();
}

/**
 * Davet kodu veya ID ile sunucuya katıl.
 */
export async function joinServer(serverIdOrCode: string): Promise<Server> {
  if (USE_MOCK) {
    const found = MOCK_DISCOVER.find(s => s.id === serverIdOrCode || s.name.toLowerCase().includes(serverIdOrCode.toLowerCase()));
    if (!found) throw new Error('Sunucu bulunamadı');
    const full: Server = { ...found, activeCount: 0, capacity: 50, level: 1, createdAt: new Date().toISOString().split('T')[0] };
    MOCK_SERVERS.push(full);
    return full;
  }

  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/servers/join`, {
    method: 'POST', headers, body: JSON.stringify({ code: serverIdOrCode }),
  });
  if (!res.ok) throw new Error('Sunucuya katılınamadı');
  return res.json();
}

/**
 * Sunucu ara / keşfet.
 */
export async function searchServers(query: string): Promise<Array<{ id: string; name: string; shortName: string; description: string; memberCount: number }>> {
  if (USE_MOCK) {
    if (!query.trim()) return MOCK_DISCOVER;
    return MOCK_DISCOVER.filter(s => s.name.toLowerCase().includes(query.toLowerCase()));
  }

  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/servers/search?q=${encodeURIComponent(query)}`, { headers });
  if (!res.ok) throw new Error('Arama başarısız');
  return res.json();
}
