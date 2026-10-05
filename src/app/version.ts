declare const __APP_VERSION__: string;
declare const __BUILD_ID__: string;
declare const __BUILD_TIME__: string;

export const APP_NAME = 'Thread Mav';
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0-dev';
export const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
export const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';
/** Friendly identity of this PWA test line (separate from the native iOS v0.26 history). */
export const VERSION_LABEL = 'Thread Mav PWA Test 1.0';
/** Bumped whenever calculation logic changes; stored with every saved record. */
export const ENGINE_VERSION = 'thread-1.0 / sine-1.0';
