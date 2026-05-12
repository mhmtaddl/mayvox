import 'dotenv/config';

import { spawnSync } from 'node:child_process';
import * as rtcNode from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';
import { Pool } from 'pg';

import { isSystemMusicIdentity } from '../utils/systemIdentity';

type EnvCheck = {
  name: string;
  requiredForDryRun?: boolean;
  requiredForConnect?: boolean;
  requiredForPublish?: boolean;
  requiredForSessionPoll?: boolean;
};

type MusicSessionStatus = 'playing' | 'paused' | 'stopped';

type MusicSessionSnapshot = {
  status: MusicSessionStatus;
  currentSourceId: string | null;
  sourceTitle: string | null;
  volume: number;
  updatedAt: string | null;
};

const checks: EnvCheck[] = [
  { name: 'LIVEKIT_URL', requiredForConnect: true },
  { name: 'LIVEKIT_API_KEY', requiredForConnect: true },
  { name: 'LIVEKIT_API_SECRET', requiredForConnect: true },
  { name: 'MUSIC_TEST_SERVER_ID', requiredForDryRun: true },
  { name: 'MUSIC_TEST_CHANNEL_ID', requiredForDryRun: true },
  { name: 'DATABASE_URL', requiredForSessionPoll: true },
  { name: 'MUSIC_TEST_AUDIO_URL', requiredForPublish: true },
  { name: 'MUSIC_TEST_AUDIO_FILE', requiredForPublish: true },
];

function hasEnv(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function flagEnabled(name: string): boolean {
  return process.env[name] === '1';
}

function maskValue(value?: string): string {
  if (!value) {
    return '(missing)';
  }

  if (value.length <= 10) {
    return `${value.slice(0, 2)}...${value.slice(-2)}`;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function log(message: string): void {
  console.log(`[room-music-worker] ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function readHoldMs(): number {
  const raw = process.env.MUSIC_WORKER_HOLD_MS?.trim();
  if (!raw) {
    return 30_000;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1_000) {
    log(`MUSIC_WORKER_HOLD_MS invalid; using 30000`);
    return 30_000;
  }

  return Math.min(parsed, 300_000);
}

function readConnectTimeoutMs(): number {
  const raw = process.env.MUSIC_WORKER_CONNECT_TIMEOUT_MS?.trim();
  if (!raw) {
    return 10_000;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1_000) {
    log(`MUSIC_WORKER_CONNECT_TIMEOUT_MS invalid; using 10000`);
    return 10_000;
  }

  return Math.min(parsed, 60_000);
}

function readToneHz(): number {
  const raw = process.env.MUSIC_WORKER_TONE_HZ?.trim();
  if (!raw) {
    return 440;
  }

  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 20 || parsed > 20_000) {
    log(`MUSIC_WORKER_TONE_HZ invalid; using 440`);
    return 440;
  }

  return parsed;
}

function readPollMs(): number {
  const raw = process.env.MUSIC_WORKER_POLL_MS?.trim();
  if (!raw) {
    return 1_500;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 500) {
    log(`MUSIC_WORKER_POLL_MS invalid; using 1500`);
    return 1_500;
  }

  return Math.min(parsed, 30_000);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function checkFfmpeg(): void {
  const result = spawnSync('ffmpeg', ['-version'], {
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.error) {
    log(`ffmpeg: missing from PATH (${result.error.message})`);
    return;
  }

  if (result.status !== 0) {
    log(`ffmpeg: command returned status ${result.status ?? 'unknown'}`);
    return;
  }

  const firstLine = result.stdout.split(/\r?\n/).find(Boolean);
  log(`ffmpeg: ${firstLine ?? 'available'}`);
}

function checkRtcNodeApi(): void {
  const rtc = rtcNode as Record<string, unknown>;
  const localAudioTrack = rtcNode.LocalAudioTrack as unknown as Record<string, unknown>;
  const audioSourcePrototype = rtcNode.AudioSource?.prototype as unknown as Record<string, unknown> | undefined;
  const localParticipantPrototype = rtcNode.LocalParticipant?.prototype as unknown as Record<string, unknown> | undefined;

  log(`@livekit/rtc-node Room: ${typeof rtcNode.Room}`);
  log(`@livekit/rtc-node AudioSource: ${typeof rtcNode.AudioSource}`);
  log(`@livekit/rtc-node LocalAudioTrack: ${typeof rtcNode.LocalAudioTrack}`);
  log(`@livekit/rtc-node TrackSource: ${typeof rtc.TrackSource}`);
  log(`@livekit/rtc-node TrackPublishOptions: ${typeof rtc.TrackPublishOptions}`);
  log(`LocalAudioTrack.createAudioTrack: ${typeof localAudioTrack.createAudioTrack}`);
  log(`AudioSource.captureFrame: ${typeof audioSourcePrototype?.captureFrame}`);
  log(`LocalParticipant.publishTrack: ${typeof localParticipantPrototype?.publishTrack}`);
}

function reportEnv(connectRequested: boolean, publishRequested: boolean): void {
  for (const check of checks) {
    const present = hasEnv(check.name);
    log(`${check.name}: ${present ? 'set' : 'missing'}`);
  }

  const missingDryRun = checks
    .filter((check) => check.requiredForDryRun && !hasEnv(check.name))
    .map((check) => check.name);
  const missingConnect = checks
    .filter((check) => check.requiredForConnect && !hasEnv(check.name))
    .map((check) => check.name);
  const missingPoll = checks
    .filter((check) => check.requiredForSessionPoll && !hasEnv(check.name))
    .map((check) => check.name);
  const hasAudioSource = hasEnv('MUSIC_TEST_AUDIO_URL') || hasEnv('MUSIC_TEST_AUDIO_FILE');

  if (missingDryRun.length > 0) {
    log(`dry-run missing env: ${missingDryRun.join(', ')}`);
  }

  if (connectRequested && missingConnect.length > 0) {
    log(`connect missing env: ${missingConnect.join(', ')}`);
  }

  if (flagEnabled('MUSIC_WORKER_SESSION_POLL') && missingPoll.length > 0) {
    log(`session poll missing env: ${missingPoll.join(', ')}`);
  }

  if (publishRequested && !hasAudioSource) {
    log('publish missing env: MUSIC_TEST_AUDIO_URL or MUSIC_TEST_AUDIO_FILE');
  }
}

function getMissingConnectEnv(): string[] {
  return checks
    .filter((check) => (check.requiredForDryRun || check.requiredForConnect) && !hasEnv(check.name))
    .map((check) => check.name);
}

function getMissingPollEnv(): string[] {
  return checks
    .filter((check) => (check.requiredForDryRun || check.requiredForConnect || check.requiredForSessionPoll) && !hasEnv(check.name))
    .map((check) => check.name);
}

function createRoomMusicPool(): Pool {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for session polling');
  }

  return new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 5_000,
  });
}

async function readSession(
  pool: Pool,
  serverId: string,
  channelId: string,
): Promise<MusicSessionSnapshot | null> {
  const { rows } = await pool.query<{
    status: MusicSessionStatus;
    current_source_id: string | null;
    source_title: string | null;
    volume: number;
    updated_at: string | null;
  }>(
    `SELECT s.status,
            s.current_source_id::text AS current_source_id,
            ms.title AS source_title,
            s.volume,
            s.updated_at::text AS updated_at
       FROM room_music_sessions s
       LEFT JOIN music_sources ms ON ms.id = s.current_source_id
      WHERE s.server_id = $1 AND s.channel_id = $2
      LIMIT 1`,
    [serverId, channelId],
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    status: row.status,
    currentSourceId: row.current_source_id,
    sourceTitle: row.source_title,
    volume: row.volume,
    updatedAt: row.updated_at,
  };
}

async function connectAndDisconnect(params: {
  serverId: string;
  channelId: string;
  publishRequested: boolean;
}): Promise<void> {
  const { serverId, channelId, publishRequested } = params;
  const livekitUrl = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  const roomName = channelId;
  const identity = `system-music:${serverId}:${channelId}`;
  const holdMs = readHoldMs();
  const connectTimeoutMs = readConnectTimeoutMs();

  if (!livekitUrl || !apiKey || !apiSecret) {
    log('connect skipped; LiveKit env is incomplete');
    return;
  }

  const token = new AccessToken(apiKey, apiSecret, {
    identity,
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });

  const jwt = await token.toJwt();
  const room = new rtcNode.Room();

  log(`connecting to room ${maskValue(roomName)} as system-music:${maskValue(serverId)}:${maskValue(channelId)}`);
  await withTimeout(room.connect(livekitUrl, jwt), connectTimeoutMs, 'LiveKit connect');
  log(`connected; holding for ${holdMs}ms`);

  try {
    if (publishRequested) {
      await publishTestTone(room, holdMs);
    } else {
      await sleep(holdMs);
    }
  } finally {
    room.disconnect();
    log('disconnected');
  }
}

async function publishTestTone(room: rtcNode.Room, durationMs: number): Promise<void> {
  const sampleRate = 48_000;
  const channels = 1;
  const frameMs = 10;
  const samplesPerFrame = Math.floor(sampleRate / (1000 / frameMs));
  const toneHz = readToneHz();
  const amplitude = 0.18 * 32767;
  const source = new rtcNode.AudioSource(sampleRate, channels);
  const track = rtcNode.LocalAudioTrack.createAudioTrack('mayvox-music-test-tone', source);
  const options = new rtcNode.TrackPublishOptions();
  options.source = rtcNode.TrackSource.SOURCE_MICROPHONE;

  log(`publishing generated test tone for ${durationMs}ms`);
  await room.localParticipant!.publishTrack(track, options);
  log('test audio track published');

  let sampleCursor = 0;
  const frames = Math.ceil(durationMs / frameMs);
  try {
    for (let frameIndex = 0; frameIndex < frames; frameIndex++) {
      const frame = rtcNode.AudioFrame.create(sampleRate, channels, samplesPerFrame);
      for (let sampleIndex = 0; sampleIndex < samplesPerFrame; sampleIndex++) {
        const value = Math.round(
          amplitude * Math.sin((2 * Math.PI * toneHz * sampleCursor) / sampleRate),
        );
        sampleCursor++;
        frame.data[sampleIndex] = value;
      }
      await source.captureFrame(frame);
      await sleep(frameMs);
    }
    await source.waitForPlayout();
    log('test tone playout complete');
  } finally {
    await track.close();
    log('test audio track closed');
  }
}

async function publishTestToneUntil(room: rtcNode.Room, shouldContinue: () => boolean): Promise<void> {
  const sampleRate = 48_000;
  const channels = 1;
  const frameMs = 10;
  const samplesPerFrame = Math.floor(sampleRate / (1000 / frameMs));
  const toneHz = readToneHz();
  const amplitude = 0.18 * 32767;
  const source = new rtcNode.AudioSource(sampleRate, channels);
  const track = rtcNode.LocalAudioTrack.createAudioTrack('mayvox-music-test-tone', source);
  const options = new rtcNode.TrackPublishOptions();
  options.source = rtcNode.TrackSource.SOURCE_MICROPHONE;

  await room.localParticipant!.publishTrack(track, options);
  log('session audio track published');

  let sampleCursor = 0;
  try {
    while (shouldContinue()) {
      const frame = rtcNode.AudioFrame.create(sampleRate, channels, samplesPerFrame);
      for (let sampleIndex = 0; sampleIndex < samplesPerFrame; sampleIndex++) {
        const value = Math.round(
          amplitude * Math.sin((2 * Math.PI * toneHz * sampleCursor) / sampleRate),
        );
        sampleCursor++;
        frame.data[sampleIndex] = value;
      }
      await source.captureFrame(frame);
      await sleep(frameMs);
    }
    source.clearQueue();
  } finally {
    await track.close();
    log('session audio track closed');
  }
}

async function runSessionPolling(params: {
  serverId: string;
  channelId: string;
  publishRequested: boolean;
}): Promise<void> {
  const { serverId, channelId, publishRequested } = params;
  const holdMs = readHoldMs();
  const pollMs = readPollMs();
  const startedAt = Date.now();
  const endsAt = startedAt + holdMs;
  const pool = createRoomMusicPool();
  let room: rtcNode.Room | null = null;
  let publishing = false;
  let publishTask: Promise<void> | null = null;
  let lastStatus: string | null = null;

  const connectRoom = async (): Promise<rtcNode.Room> => {
    if (room) {
      return room;
    }
    const livekitUrl = process.env.LIVEKIT_URL?.trim();
    const apiKey = process.env.LIVEKIT_API_KEY?.trim();
    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
    if (!livekitUrl || !apiKey || !apiSecret) {
      throw new Error('LiveKit env is incomplete');
    }

    const roomName = channelId;
    const identity = `system-music:${serverId}:${channelId}`;
    const token = new AccessToken(apiKey, apiSecret, { identity });
    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });
    const jwt = await token.toJwt();
    const nextRoom = new rtcNode.Room();
    log(`poll connecting to room ${maskValue(roomName)} as system-music:${maskValue(serverId)}:${maskValue(channelId)}`);
    await withTimeout(nextRoom.connect(livekitUrl, jwt), readConnectTimeoutMs(), 'LiveKit connect');
    room = nextRoom;
    log('poll connected');
    return nextRoom;
  };

  const stopPublishing = async (): Promise<void> => {
    if (!publishing && !publishTask) {
      return;
    }
    publishing = false;
    await publishTask;
    publishTask = null;
  };

  try {
    log(`session polling started for ${holdMs}ms`);
    while (Date.now() < endsAt) {
      const session = await readSession(pool, serverId, channelId);
      const status = session?.status ?? 'none';
      if (status !== lastStatus) {
        log(`session status: ${status}${session?.sourceTitle ? ` (${session.sourceTitle})` : ''}`);
        lastStatus = status;
      }

      if (session?.status === 'playing') {
        if (publishRequested && !publishTask) {
          const activeRoom = await connectRoom();
          publishing = true;
          publishTask = publishTestToneUntil(activeRoom, () => publishing);
        }
      } else {
        await stopPublishing();
      }

      await sleep(pollMs);
    }
    await stopPublishing();
  } finally {
    await pool.end();
    const connectedRoom = room as rtcNode.Room | null;
    if (connectedRoom) {
      connectedRoom.disconnect();
      log('poll disconnected');
    }
  }
}

async function main(): Promise<void> {
  const serverId = process.env.MUSIC_TEST_SERVER_ID?.trim();
  const channelId = process.env.MUSIC_TEST_CHANNEL_ID?.trim();
  const sessionPollRequested = flagEnabled('MUSIC_WORKER_SESSION_POLL');
  const connectRequested = flagEnabled('MUSIC_WORKER_CONNECT') || sessionPollRequested;
  const publishRequested = flagEnabled('MUSIC_WORKER_PUBLISH');

  log(`${sessionPollRequested ? 'session poll' : connectRequested ? 'connect test' : 'dry-run'} starting`);
  reportEnv(connectRequested, publishRequested);
  checkRtcNodeApi();

  if (serverId && channelId) {
    const identity = `system-music:${serverId}:${channelId}`;
    log(`room: ${maskValue(channelId)}`);
    log(`identity: system-music:${maskValue(serverId)}:${maskValue(channelId)}`);
    log(`identity helper check: ${isSystemMusicIdentity(identity) ? 'system-music' : 'not-system'}`);
  }

  if (connectRequested) {
    const missingConnectEnv = sessionPollRequested ? getMissingPollEnv() : getMissingConnectEnv();
    if (missingConnectEnv.length > 0 || !serverId || !channelId) {
      log(`connect skipped; missing env: ${missingConnectEnv.join(', ') || 'MUSIC_TEST_SERVER_ID, MUSIC_TEST_CHANNEL_ID'}`);
      return;
    }

    if (sessionPollRequested) {
      await runSessionPolling({ serverId, channelId, publishRequested });
      log('session polling complete');
      return;
    }

    await connectAndDisconnect({ serverId, channelId, publishRequested });
    log(publishRequested ? 'publish test complete' : 'connect test complete; no audio publish performed');
    return;
  }

  if (publishRequested) {
    log('MUSIC_WORKER_PUBLISH=1 was set, but this worker does not publish audio yet.');
  }

  checkFfmpeg();
  log('dry-run complete; no LiveKit connection and no audio publish performed');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[room-music-worker] fatal: ${message}`);
    process.exit(1);
  });
