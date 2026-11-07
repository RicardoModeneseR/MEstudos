import { supabase } from './supabase';

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}

export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Mostra uma notificação local (funciona com o app aberto ou em segundo plano recente). */
export async function notify(title: string, body: string, tag?: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await reg.showNotification(title, { body, tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' });
    else new Notification(title, { body, tag });
  } catch {
    /* ignore */
  }
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export type PushResult = 'ok' | 'denied' | 'unsupported' | 'not-installed' | 'no-backend' | 'error';

/**
 * Pede permissão e registra este aparelho para receber lembretes push do servidor.
 * No iPhone, só funciona com o app instalado na Tela de Início (iOS 16.4+).
 */
export async function enablePush(): Promise<PushResult> {
  if (!notificationsSupported()) return /iPhone|iPad/.test(navigator.userAgent) && !isStandalone() ? 'not-installed' : 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!supabase || !vapid || !('PushManager' in window)) return 'no-backend';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid) }));
    const json = sub.toJSON();
    const { error } = await supabase.from('push_subscriptions').upsert({
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
    });
    return error ? 'error' : 'ok';
  } catch (e) {
    console.error(e);
    return 'error';
  }
}

export async function pushStatus(): Promise<'on' | 'off'> {
  if (!notificationsSupported() || Notification.permission !== 'granted' || !('PushManager' in window)) return 'off';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

let audioCtx: AudioContext | null = null;
/** Sininho suave ao fim do pomodoro. */
export function chime() {
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    [0, 0.18, 0.36].forEach((t, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = [660, 880, 990][i];
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.65);
    });
  } catch {
    /* sem áudio */
  }
}
