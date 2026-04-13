import { Request, Response, NextFunction } from 'express';

// Brute-force ve kazara flood koruması. In-memory (tek instance için yeterli).
// Scale-out durumunda Redis'e taşınmalı.
const WINDOW_MS = 60_000;    // 1 dk pencere
const MAX_REQS = 60;         // admin başına 60 istek/dk
const WRITE_WINDOW_MS = 60_000;
const MAX_WRITES = 20;       // mutasyonlar için daha sıkı

type Bucket = { count: number; resetAt: number };
const reads = new Map<string, Bucket>();
const writes = new Map<string, Bucket>();

function hit(bucket: Map<string, Bucket>, key: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  let b = bucket.get(key);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    bucket.set(key, b);
  }
  b.count += 1;
  return b.count <= max;
}

function keyFor(req: Request): string {
  const uid = (req as any).userId as string | undefined;
  return uid ? `u:${uid}` : `ip:${req.ip || 'unknown'}`;
}

/** Genel admin endpoint limit (okuma dahil). */
export function adminRateLimit(req: Request, res: Response, next: NextFunction): void {
  if (!hit(reads, keyFor(req), WINDOW_MS, MAX_REQS)) {
    res.status(429).json({ error: 'Çok fazla istek, biraz bekleyin.' });
    return;
  }
  next();
}

/** Mutasyon endpoint'leri için ek sıkı limit. */
export function adminWriteRateLimit(req: Request, res: Response, next: NextFunction): void {
  if (!hit(writes, keyFor(req), WRITE_WINDOW_MS, MAX_WRITES)) {
    res.status(429).json({ error: 'Çok fazla yönetici işlemi, lütfen yavaşlayın.' });
    return;
  }
  next();
}
