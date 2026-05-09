export interface VoiceJoinTrace {
  id: string;
  channelId: string;
  startedAt: number;
}

const isVoiceJoinTraceEnabled = import.meta.env.DEV;

export const createVoiceJoinTrace = (channelId: string): VoiceJoinTrace => ({
  id: `${channelId}-${Date.now()}`,
  channelId,
  startedAt: performance.now(),
});

export const logVoiceJoinTrace = (
  trace: VoiceJoinTrace | undefined,
  stage: string,
  data: Record<string, unknown> = {},
) => {
  if (!isVoiceJoinTraceEnabled || !trace) return;
  const dt = Math.round(performance.now() - trace.startedAt);
  console.debug(`[voice-join-trace] ${stage}`, {
    traceId: trace.id,
    channelId: trace.channelId,
    dt,
    ...data,
  });
};
