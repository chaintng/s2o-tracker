import { StoredPushSubscription } from "../types";

function getNotificationSupport(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function getWebPushPublicKey(): string {
  const publicKey = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined;

  if (!publicKey) {
    throw new Error("Missing VITE_WEB_PUSH_PUBLIC_KEY env var");
  }

  return publicKey;
}

function urlBase64ToUint8Array(base64Value: string): Uint8Array<ArrayBuffer> {
  const normalizedValue = base64Value.replace(/-/g, "+").replace(/_/g, "/");
  const paddedValue = normalizedValue.padEnd(
    normalizedValue.length + ((4 - (normalizedValue.length % 4)) % 4),
    "="
  );
  const rawData = window.atob(paddedValue);
  const buffer = new ArrayBuffer(rawData.length);
  const output = new Uint8Array(buffer);

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return output;
}

function toStoredPushSubscription(subscription: PushSubscription): StoredPushSubscription {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;

  if (!p256dh || !auth) {
    throw new Error("Push subscription keys are incomplete");
  }

  return {
    endpoint: subscription.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: {
      p256dh,
      auth,
    },
  };
}

export function registerAppServiceWorker(): void {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const serviceWorkerUrl = `${import.meta.env.BASE_URL}sw.js`;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(serviceWorkerUrl, { scope: import.meta.env.BASE_URL })
      .catch((error: Error) => {
        console.error("Failed to register service worker", error);
      });
  });
}

export function isNotificationSupported(): boolean {
  return getNotificationSupport();
}

export async function ensurePushSubscription(): Promise<StoredPushSubscription> {
  if (!getNotificationSupport()) {
    throw new Error("Push notifications are not supported in this browser.");
  }

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();

  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const registration = await navigator.serviceWorker.ready;
  const existingSubscription = await registration.pushManager.getSubscription();

  if (existingSubscription) {
    return toStoredPushSubscription(existingSubscription);
  }

  const createdSubscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(getWebPushPublicKey()),
  });

  return toStoredPushSubscription(createdSubscription);
}
