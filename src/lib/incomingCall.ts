/**
 * IncomingCall native Capacitor plugin arayüzü.
 * Android tarafındaki IncomingCallPlugin.java ile köprü kurar.
 * Masaüstünde / web'de çağrılırsa null döner.
 */
import { registerPlugin } from '@capacitor/core';
import { isCapacitor } from './platform';

export interface IncomingCallPluginDef {
  show(options: { inviterName: string; roomName: string; roomId: string }): Promise<void>;
  dismiss(): Promise<void>;
  checkPermissions(): Promise<{ notifications: string; fullScreen: string }>;
  requestPermissions(): Promise<{ notifications: string }>;
  checkMicrophonePermission(): Promise<{ microphone: string }>;
  requestMicrophonePermission(): Promise<{ microphone: string }>;
  openAppSettings(): Promise<void>;
  openNotificationSettings(): Promise<void>;
  addListener(
    eventName: 'callRejectedFromNotification',
    listenerFunc: () => void,
  ): Promise<{ remove: () => void }>;
}

const IncomingCall = isCapacitor()
  ? registerPlugin<IncomingCallPluginDef>('IncomingCall')
  : null;

export default IncomingCall;
