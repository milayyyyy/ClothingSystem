/** Chromium `beforeinstallprompt` — not available on iOS Safari. */
export type PwaInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/i.test(ua);
  const notChrome = !/CriOS|Chrome/i.test(ua);
  return iOS && webkit && notChrome;
}

export function canUseNativeInstallPrompt(): boolean {
  return typeof window !== "undefined" && "BeforeInstallPromptEvent" in window;
}
