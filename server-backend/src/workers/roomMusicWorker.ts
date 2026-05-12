import 'dotenv/config';

import { spawnSync } from 'node:child_process';
import * as rtcNode from '@livekit/rtc-node';

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

async function main(): Promise<void> {
  const serverId = process.env.MUSIC_TEST_SERVER_ID?.trim();
  const channelId = process.env.MUSIC_TEST_CHANNEL_ID?.trim();
  const connectRequested = flagEnabled('MUSIC_WORKER_CONNECT');
  const publishRequested = flagEnabled('MUSIC_WORKER_PUBLISH');

  log('dry-run starting');
  reportEnv(connectRequested, publishRequested);
  checkFfmpeg();
  checkRtcNodeApi();

  if (serverId && channelId) {
    const identity = `system-music:${serverId}:${channelId}`;
    log(`room: ${maskValue(channelId)}`);
    log(`identity: system-music:${maskValue(serverId)}:${maskValue(channelId)}`);
    log(`identity helper check: ${isSystemMusicIdentity(identity) ? 'system-music' : 'not-system'}`);
  }

  if (connectRequested) {
    log('MUSIC_WORKER_CONNECT=1 was set, but Patch 5.1 dry-run does not connect to LiveKit.');
  }

  if (publishRequested) {
    log('MUSIC_WORKER_PUBLISH=1 was set, but Patch 5.1 dry-run does not publish audio.');
  }

  log('dry-run complete; no LiveKit connection and no audio publish performed');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[room-music-worker] fatal: ${message}`);
  process.exitCode = 1;
});
