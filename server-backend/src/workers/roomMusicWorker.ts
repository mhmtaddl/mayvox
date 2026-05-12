import 'dotenv/config';

import { spawnSync } from 'node:child_process';
import * as rtcNode from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';

import { isSystemMusicIdentity } from '../utils/systemIdentity';

type EnvCheck = {
  name: string;
  requiredForDryRun?: boolean;
  requiredForConnect?: boolean;
  requiredForPublish?: boolean;
};

const checks: EnvCheck[] = [
  { name: 'LIVEKIT_URL', requiredForConnect: true },
  { name: 'LIVEKIT_API_KEY', requiredForConnect: true },
  { name: 'LIVEKIT_API_SECRET', requiredForConnect: true },
  { name: 'MUSIC_TEST_SERVER_ID', requiredForDryRun: true },
  { name: 'MUSIC_TEST_CHANNEL_ID', requiredForDryRun: true },
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
  const hasAudioSource = hasEnv('MUSIC_TEST_AUDIO_URL') || hasEnv('MUSIC_TEST_AUDIO_FILE');

  if (missingDryRun.length > 0) {
    log(`dry-run missing env: ${missingDryRun.join(', ')}`);
  }

  if (connectRequested && missingConnect.length > 0) {
    log(`connect missing env: ${missingConnect.join(', ')}`);
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

async function main(): Promise<void> {
  const serverId = process.env.MUSIC_TEST_SERVER_ID?.trim();
  const channelId = process.env.MUSIC_TEST_CHANNEL_ID?.trim();
  const connectRequested = flagEnabled('MUSIC_WORKER_CONNECT');
  const publishRequested = flagEnabled('MUSIC_WORKER_PUBLISH');

  log(`${connectRequested ? 'connect test' : 'dry-run'} starting`);
  reportEnv(connectRequested, publishRequested);
  checkRtcNodeApi();

  if (serverId && channelId) {
    const identity = `system-music:${serverId}:${channelId}`;
    log(`room: ${maskValue(channelId)}`);
    log(`identity: system-music:${maskValue(serverId)}:${maskValue(channelId)}`);
    log(`identity helper check: ${isSystemMusicIdentity(identity) ? 'system-music' : 'not-system'}`);
  }

  if (connectRequested) {
    const missingConnectEnv = getMissingConnectEnv();
    if (missingConnectEnv.length > 0 || !serverId || !channelId) {
      log(`connect skipped; missing env: ${missingConnectEnv.join(', ') || 'MUSIC_TEST_SERVER_ID, MUSIC_TEST_CHANNEL_ID'}`);
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
