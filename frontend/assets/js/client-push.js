import { clientApi } from './client-api.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function registerClientServiceWorker() {
  if (!('serviceWorker' in navigator)) throw new Error('Este navegador não suporta instalação PWA.');
  return navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
}

export async function getPushState() {
  if (!pushSupported()) return { supported: false, permission: 'unsupported', subscribed: false, configured: false };
  const config = await clientApi.get('/app/push/public-key').catch(() => ({ configured: false, publicKey: null }));
  const registration = await registerClientServiceWorker().catch(() => null);
  const subscription = registration ? await registration.pushManager.getSubscription().catch(() => null) : null;
  return {
    supported: true,
    permission: Notification.permission,
    subscribed: Boolean(subscription),
    configured: Boolean(config.configured && config.publicKey),
    publicKey: config.publicKey,
    message: config.message
  };
}

export async function enablePushNotifications() {
  if (!pushSupported()) throw new Error('Este celular/navegador não suporta push web. No iPhone, instale o app na tela inicial.');
  const config = await clientApi.get('/app/push/public-key');
  if (!config.configured || !config.publicKey) {
    throw new Error('Push ainda não configurado no servidor. Gere as chaves VAPID e configure no Render/.env.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permissão de notificação não foi liberada neste aparelho.');
  const registration = await registerClientServiceWorker();
  const current = await registration.pushManager.getSubscription();
  const subscription = current || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(config.publicKey)
  });
  const payload = await clientApi.post('/app/push/subscribe', {
    subscription: subscription.toJSON(),
    platform: navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad') ? 'ios-pwa' : 'web-pwa'
  });
  return payload;
}

export async function disablePushNotifications() {
  const registration = await navigator.serviceWorker?.ready;
  const subscription = registration ? await registration.pushManager.getSubscription() : null;
  if (subscription) {
    await clientApi.post('/app/push/unsubscribe', { endpoint: subscription.endpoint }).catch(() => null);
    await subscription.unsubscribe().catch(() => null);
  }
  return { ok: true };
}
