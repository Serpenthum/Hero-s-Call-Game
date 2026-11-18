import { describe, it, expect } from 'vitest';
import { installHintKind } from './installHintKind';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36';

const base = { isTouch: true, isStandalone: false, dismissed: false, hasInstallPrompt: false };

describe('installHintKind', () => {
  it('is null on a computer', () => {
    expect(installHintKind({ ...base, isTouch: false, userAgent: DESKTOP_UA, hasInstallPrompt: true })).toBeNull();
  });
  it('is null inside the installed app', () => {
    expect(installHintKind({ ...base, isStandalone: true, userAgent: IPHONE_UA })).toBeNull();
  });
  it('is null once dismissed', () => {
    expect(installHintKind({ ...base, dismissed: true, userAgent: IPHONE_UA })).toBeNull();
  });
  it('is ios for iPhone Safari on touch', () => {
    expect(installHintKind({ ...base, userAgent: IPHONE_UA })).toBe('ios');
  });
  it('is android when Chrome offered the install prompt', () => {
    expect(installHintKind({ ...base, userAgent: ANDROID_UA, hasInstallPrompt: true })).toBe('android');
  });
  it('is null on Android without the install prompt event', () => {
    expect(installHintKind({ ...base, userAgent: ANDROID_UA })).toBeNull();
  });
});
