import 'dotenv/config';

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
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
  serverId: string;
  channelId: string;
  status: MusicSessionStatus;
  currentSourceId: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  sourceMood: string | null;
  sourceType: string | null;
  volume: number;
  updatedAt: string | null;
};

type ActivePublisher = {
  session: MusicSessionSnapshot;
  audioInput: string | null;
  volume: number;
  room: rtcNode.Room;
  stop: () => void;
  done: Promise<void>;
};

type AudioFrameWriter = {
  source: rtcNode.AudioSource;
  getVolume: () => number;
  shouldContinue: () => boolean;
};

const checks: EnvCheck[] = [
  { name: 'LIVEKIT_URL', requiredForConnect: true },
  { name: 'LIVEKIT_API_KEY', requiredForConnect: true },
  { name: 'LIVEKIT_API_SECRET', requiredForConnect: true },
  { name: 'MUSIC_TEST_SERVER_ID', requiredForDryRun: true },
  { name: 'MUSIC_TEST_CHANNEL_ID', requiredForDryRun: true },
  { name: 'DATABASE_URL', requiredForSessionPoll: true },
  { name: 'MUSIC_TEST_AUDIO_URL' },
  { name: 'MUSIC_TEST_AUDIO_FILE' },
  { name: 'MUSIC_SOURCE_CHILL_URL' },
  { name: 'MUSIC_SOURCE_CHILL_FILE' },
  { name: 'MUSIC_SOURCE_FOCUS_URL' },
  { name: 'MUSIC_SOURCE_FOCUS_FILE' },
  { name: 'MUSIC_SOURCE_NIGHT_URL' },
  { name: 'MUSIC_SOURCE_NIGHT_FILE' },
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

type RunDurationMs = number | null;

function readHoldMs(): RunDurationMs {
  const raw = process.env.MUSIC_WORKER_HOLD_MS?.trim();
  if (!raw) {
    return 30_000;
  }

  if (raw === '0' || raw.toLowerCase() === 'forever' || raw.toLowerCase() === 'infinite') {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1_000) {
    log(`MUSIC_WORKER_HOLD_MS invalid; using 30000. Use 0 for continuous mode.`);
    return 30_000;
  }

  return Math.min(parsed, 300_000);
}

function formatRunDuration(durationMs: RunDurationMs): string {
  return durationMs === null ? 'continuous mode' : `${durationMs}ms`;
}

function createShutdownSignal(): { isStopped: () => boolean; dispose: () => void } {
  let stopped = false;
  const stop = (): void => {
    stopped = true;
  };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  return {
    isStopped: () => stopped,
    dispose: () => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
    },
  };
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
    return 750;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 500) {
    log(`MUSIC_WORKER_POLL_MS invalid; using 750`);
    return 750;
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

function getTestAudioInput(): string | null {
  return process.env.MUSIC_TEST_AUDIO_FILE?.trim() || process.env.MUSIC_TEST_AUDIO_URL?.trim() || null;
}

function getEnvAudioInput(prefix: string): string | null {
  const normalized = prefix.trim().toUpperCase();
  if (!normalized) {
    return null;
  }
  return process.env[`MUSIC_SOURCE_${normalized}_FILE`]?.trim() || process.env[`MUSIC_SOURCE_${normalized}_URL`]?.trim() || null;
}

function resolveAudioInputForSource(source: Pick<MusicSessionSnapshot, 'sourceUrl' | 'sourceMood'>): string | null {
  if (source.sourceUrl?.trim()) {
    return source.sourceUrl.trim();
  }

  const mood = source.sourceMood?.trim().toLowerCase();
  if (mood === 'chill' || mood === 'focus' || mood === 'night') {
    const moodInput = getEnvAudioInput(mood);
    if (moodInput) {
      return moodInput;
    }
  }

  return getTestAudioInput();
}

function buildFfmpegArgs(input: string): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-stream_loop',
    '-1',
    '-i',
    input,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '48000',
    '-f',
    's16le',
    'pipe:1',
  ];
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

  if (!connectRequested && missingDryRun.length > 0) {
    log(`dry-run missing env: ${missingDryRun.join(', ')}`);
  }

  if (connectRequested && missingConnect.length > 0) {
    log(`connect missing env: ${missingConnect.join(', ')}`);
  }

  if (flagEnabled('MUSIC_WORKER_SESSION_POLL') && missingPoll.length > 0) {
    log(`session poll missing env: ${missingPoll.join(', ')}`);
  }

  if (publishRequested) {
    const hasMappedInput = Boolean(
      getTestAudioInput() ||
        getEnvAudioInput('chill') ||
        getEnvAudioInput('focus') ||
        getEnvAudioInput('night'),
    );
    log(`publish mode: ${hasMappedInput ? 'direct audio input' : 'generated test tone'}`);
  }
}

function getMissingConnectEnv(): string[] {
  return checks
    .filter((check) => (check.requiredForDryRun || check.requiredForConnect) && !hasEnv(check.name))
    .map((check) => check.name);
}

function getMissingPollEnv(): string[] {
  return checks
    .filter((check) => (check.requiredForConnect || check.requiredForSessionPoll) && !hasEnv(check.name))
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
    source_url: string | null;
    source_mood: string | null;
    source_type: string | null;
    volume: number;
    updated_at: string | null;
  }>(
    `SELECT s.server_id::text AS server_id,
            s.channel_id AS channel_id,
            s.status,
            s.current_source_id::text AS current_source_id,
            ms.title AS source_title,
            ms.source_url AS source_url,
            ms.mood AS source_mood,
            ms.source_type AS source_type,
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
    serverId,
    channelId,
    status: row.status,
    currentSourceId: row.current_source_id,
    sourceTitle: row.source_title,
    sourceUrl: row.source_url,
    sourceMood: row.source_mood,
    sourceType: row.source_type,
    volume: row.volume,
    updatedAt: row.updated_at,
  };
}

async function readPlayingSessions(
  pool: Pool,
  serverId?: string,
  channelId?: string,
): Promise<MusicSessionSnapshot[]> {
  const params: string[] = [];
  const filters = [`s.status = 'playing'`];
  if (serverId) {
    params.push(serverId);
    filters.push(`s.server_id = $${params.length}`);
  }
  if (channelId) {
    params.push(channelId);
    filters.push(`s.channel_id = $${params.length}`);
  }

  const { rows } = await pool.query<{
    server_id: string;
    channel_id: string;
    status: MusicSessionStatus;
    current_source_id: string | null;
    source_title: string | null;
    source_url: string | null;
    source_mood: string | null;
    source_type: string | null;
    volume: number;
    updated_at: string | null;
  }>(
    `SELECT s.server_id::text AS server_id,
            s.channel_id AS channel_id,
            s.status,
            s.current_source_id::text AS current_source_id,
            ms.title AS source_title,
            ms.source_url AS source_url,
            ms.mood AS source_mood,
            ms.source_type AS source_type,
            s.volume,
            s.updated_at::text AS updated_at
       FROM room_music_sessions s
       LEFT JOIN music_sources ms ON ms.id = s.current_source_id
      WHERE ${filters.join(' AND ')}
      ORDER BY s.updated_at DESC`,
    params,
  );

  return rows.map((row) => ({
    serverId: row.server_id,
    channelId: row.channel_id,
    status: row.status,
    currentSourceId: row.current_source_id,
    sourceTitle: row.source_title,
    sourceUrl: row.source_url,
    sourceMood: row.source_mood,
    sourceType: row.source_type,
    volume: row.volume,
    updatedAt: row.updated_at,
  }));
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
  const shutdown = createShutdownSignal();

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
  log(`connected; holding for ${formatRunDuration(holdMs)}`);

  try {
    if (publishRequested) {
      if (holdMs === null) {
        await publishTestToneUntil(room, () => !shutdown.isStopped(), () => 70);
      } else {
        await publishTestTone(room, holdMs);
      }
    } else {
      while (!shutdown.isStopped()) {
        if (holdMs !== null) {
          await sleep(holdMs);
          break;
        }
        await sleep(1_000);
      }
    }
  } finally {
    shutdown.dispose();
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
  const amplitude = volumeToAmplitude(70);
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

function volumeToAmplitude(volume: number): number {
  const normalized = Math.max(0, Math.min(100, volume)) / 100;
  return 0.18 * normalized * 32767;
}

function applyVolumeToSample(sample: number, volume: number): number {
  const normalized = Math.max(0, Math.min(100, volume)) / 100;
  return Math.max(-32768, Math.min(32767, Math.round(sample * normalized)));
}

async function publishPcmBuffer(buffer: Buffer, writer: AudioFrameWriter): Promise<void> {
  const sampleRate = 48_000;
  const channels = 1;
  const frameMs = 10;
  const samplesPerFrame = Math.floor(sampleRate / (1000 / frameMs));
  const bytesPerFrame = samplesPerFrame * 2;

  for (let offset = 0; offset + bytesPerFrame <= buffer.length && writer.shouldContinue(); offset += bytesPerFrame) {
    const frame = rtcNode.AudioFrame.create(sampleRate, channels, samplesPerFrame);
    const volume = writer.getVolume();
    for (let sampleIndex = 0; sampleIndex < samplesPerFrame; sampleIndex++) {
      const sample = buffer.readInt16LE(offset + sampleIndex * 2);
      frame.data[sampleIndex] = applyVolumeToSample(sample, volume);
    }
    await writer.source.captureFrame(frame);
  }
}

async function publishDirectAudioUntil(room: rtcNode.Room, input: string, shouldContinue: () => boolean, getVolume: () => number): Promise<void> {
  const sampleRate = 48_000;
  const channels = 1;
  const source = new rtcNode.AudioSource(sampleRate, channels);
  const track = rtcNode.LocalAudioTrack.createAudioTrack('mayvox-music-direct-audio', source);
  const options = new rtcNode.TrackPublishOptions();
  options.source = rtcNode.TrackSource.SOURCE_MICROPHONE;
  let ffmpeg: ChildProcess | null = null;

  await room.localParticipant!.publishTrack(track, options);
  log('session direct audio track published');

  try {
    ffmpeg = spawn('ffmpeg', buildFfmpegArgs(input), {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let pending = Buffer.alloc(0);
    let ffmpegError = '';
    ffmpeg.stderr?.setEncoding('utf8');
    ffmpeg.stderr?.on('data', (chunk: string) => {
      ffmpegError += chunk;
    });

    if (!ffmpeg.stdout) {
      throw new Error('ffmpeg stdout unavailable');
    }

    for await (const chunk of ffmpeg.stdout) {
      if (!shouldContinue()) break;
      pending = Buffer.concat([pending, chunk as Buffer]);
      const completeBytes = pending.length - (pending.length % 960);
      if (completeBytes <= 0) continue;
      await publishPcmBuffer(pending.subarray(0, completeBytes), { source, getVolume, shouldContinue });
      pending = pending.subarray(completeBytes);
    }

    if (ffmpegError.trim()) {
      log(`ffmpeg reported: ${ffmpegError.trim().slice(0, 240)}`);
    }
    source.clearQueue();
  } finally {
    if (ffmpeg && !ffmpeg.killed) {
      ffmpeg.kill('SIGTERM');
    }
    await track.close();
    log('session direct audio track closed');
  }
}

async function publishTestToneUntil(room: rtcNode.Room, shouldContinue: () => boolean, getVolume: () => number): Promise<void> {
  const sampleRate = 48_000;
  const channels = 1;
  const frameMs = 10;
  const samplesPerFrame = Math.floor(sampleRate / (1000 / frameMs));
  const toneHz = readToneHz();
  const source = new rtcNode.AudioSource(sampleRate, channels);
  const track = rtcNode.LocalAudioTrack.createAudioTrack('mayvox-music-test-tone', source);
  const options = new rtcNode.TrackPublishOptions();
  options.source = rtcNode.TrackSource.SOURCE_MICROPHONE;

  await room.localParticipant!.publishTrack(track, options);
  log('session audio track published');

  let sampleCursor = 0;
  try {
    while (shouldContinue()) {
      const amplitude = volumeToAmplitude(getVolume());
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
  serverId?: string;
  channelId?: string;
  publishRequested: boolean;
}): Promise<void> {
  const { serverId, channelId, publishRequested } = params;
  const holdMs = readHoldMs();
  const pollMs = readPollMs();
  const startedAt = Date.now();
  const endsAt = holdMs === null ? null : startedAt + holdMs;
  const pool = createRoomMusicPool();
  const shutdown = createShutdownSignal();
  const publishers = new Map<string, ActivePublisher>();

  const connectRoom = async (session: MusicSessionSnapshot): Promise<rtcNode.Room> => {
    const livekitUrl = process.env.LIVEKIT_URL?.trim();
    const apiKey = process.env.LIVEKIT_API_KEY?.trim();
    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
    if (!livekitUrl || !apiKey || !apiSecret) {
      throw new Error('LiveKit env is incomplete');
    }

    const roomName = session.channelId;
    const identity = `system-music:${session.serverId}:${session.channelId}`;
    const token = new AccessToken(apiKey, apiSecret, { identity });
    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });
    const jwt = await token.toJwt();
    const nextRoom = new rtcNode.Room();
    log(`poll connecting to room ${maskValue(roomName)} as system-music:${maskValue(session.serverId)}:${maskValue(session.channelId)}`);
    await withTimeout(nextRoom.connect(livekitUrl, jwt), readConnectTimeoutMs(), 'LiveKit connect');
    log(`poll connected: ${maskValue(roomName)}`);
    return nextRoom;
  };

  const stopPublisher = async (key: string): Promise<void> => {
    const publisher = publishers.get(key);
    if (!publisher) {
      return;
    }
    publishers.delete(key);
    publisher.stop();
    await publisher.done;
    publisher.room.disconnect();
    log(`poll disconnected: ${maskValue(publisher.session.channelId)}`);
  };

  const startPublisher = async (session: MusicSessionSnapshot): Promise<void> => {
    const key = `${session.serverId}:${session.channelId}`;
    if (publishers.has(key)) {
      const publisher = publishers.get(key);
      if (publisher) {
        const nextAudioInput = resolveAudioInputForSource(session);
        if (publisher.session.currentSourceId !== session.currentSourceId || publisher.audioInput !== nextAudioInput) {
          await stopPublisher(key);
        } else {
          publisher.session = session;
          publisher.volume = session.volume;
          return;
        }
      }
    }

    const room = await connectRoom(session);
    let active = true;
    const audioInput = resolveAudioInputForSource(session);
    const publisher: ActivePublisher = {
      session,
      audioInput,
      volume: session.volume,
      room,
      stop: () => {
        active = false;
      },
      done: Promise.resolve(),
    };
    publisher.done = audioInput
      ? publishDirectAudioUntil(room, audioInput, () => active && !shutdown.isStopped(), () => publisher.volume)
      : publishTestToneUntil(room, () => active && !shutdown.isStopped(), () => publisher.volume);
    publishers.set(key, publisher);
    log(`session audio active: ${maskValue(session.channelId)}${session.sourceTitle ? ` (${session.sourceTitle})` : ''}; source=${audioInput ? 'direct audio' : 'generated tone'}`);
  };

  try {
    const scope = serverId && channelId ? `${maskValue(serverId)}:${maskValue(channelId)}` : 'all playing sessions';
    log(`session polling started for ${formatRunDuration(holdMs)}; scope=${scope}`);
    while (!shutdown.isStopped() && (endsAt === null || Date.now() < endsAt)) {
      const sessions = await readPlayingSessions(pool, serverId, channelId);
      const activeKeys = new Set(sessions.map((session) => `${session.serverId}:${session.channelId}`));

      for (const [key] of publishers) {
        if (!activeKeys.has(key)) {
          await stopPublisher(key);
        }
      }

      if (publishRequested) {
        for (const session of sessions) {
          await startPublisher(session);
        }
      } else if (sessions.length > 0) {
        log(`session poll saw ${sessions.length} playing session(s); publish disabled`);
      }

      await sleep(pollMs);
    }
  } finally {
    shutdown.dispose();
    for (const key of [...publishers.keys()]) {
      await stopPublisher(key);
    }
    await pool.end();
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
    const missingRoomEnv = !sessionPollRequested && (!serverId || !channelId);
    if (missingConnectEnv.length > 0 || missingRoomEnv) {
      log(`connect skipped; missing env: ${missingConnectEnv.join(', ') || 'MUSIC_TEST_SERVER_ID, MUSIC_TEST_CHANNEL_ID'}`);
      return;
    }

    if (sessionPollRequested) {
      await runSessionPolling({ serverId, channelId, publishRequested });
      log('session polling complete');
      return;
    }

    await connectAndDisconnect({ serverId: serverId!, channelId: channelId!, publishRequested });
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
