import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

/**
 * crashReporter: Captures JS-level fatal errors that React's ErrorBoundary cannot
 * (errors thrown outside the render tree — async callbacks, native bridge, timers).
 *
 * Why this exists: on a Sideloadly/production build there is no Metro redbox and no
 * Xcode console. Without this, a fatal JS error is an instant silent crash. We persist
 * the error to storage BEFORE the default handler tears the app down, so the next launch
 * can surface exactly what went wrong.
 */

const LAST_CRASH_KEY = 'pulse_last_crash_v1';

export interface CrashRecord {
  name: string;
  message: string;
  stack: string;
  isFatal: boolean;
  time: number;
}

let installed = false;

export function installCrashReporter(): void {
  if (installed) return;
  installed = true;

  const g: any = global as any;
  // ErrorUtils is a React Native global; guard in case it's unavailable.
  if (!g.ErrorUtils || typeof g.ErrorUtils.getGlobalHandler !== 'function') {
    return;
  }

  const previousHandler = g.ErrorUtils.getGlobalHandler();

  g.ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    try {
      const record: CrashRecord = {
        name: error?.name ? String(error.name) : 'Error',
        message: error?.message ? String(error.message) : String(error),
        stack: error?.stack ? String(error.stack) : '',
        isFatal: isFatal === true,
        time: Date.now(),
      };
      // CRITICAL FIX: Schedule AsyncStorage write to next event loop to avoid blocking render
      // Never call AsyncStorage synchronously from error handler during render phase
      setImmediate(() => {
        AsyncStorage.setItem(LAST_CRASH_KEY, JSON.stringify(record)).catch(() => {});
      });
      console.error('[CrashReporter] Fatal JS error captured:', record.name, record.message);

      // CRASH FIX: Show immediate Alert so user sees fatal error before app dies
      if (isFatal) {
        try {
          const msg = `${record.name}: ${record.message}`.slice(0, 200);
          Alert.alert(
            'Fatal Error',
            msg,
            [{ text: 'OK' }],
            { cancelable: false }
          );
        } catch {
          // Alert might not work at this point, but try anyway
        }
      }
    } catch {
      // Never let the reporter itself throw.
    }

    // Preserve default behavior so we don't mask the crash in dev.
    if (typeof previousHandler === 'function') {
      previousHandler(error, isFatal);
    }
  });
}

export async function getLastCrash(): Promise<CrashRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_CRASH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.message === 'string') return parsed as CrashRecord;
    return null;
  } catch {
    return null;
  }
}

export async function clearLastCrash(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LAST_CRASH_KEY);
  } catch {
    // ignore
  }
}
