import { AppCheck, getToken as getAppCheckToken } from 'firebase/app-check';

export async function getAppCheckTokenOrNull(
  appCheck: AppCheck | null | undefined,
  forceRefresh = false,
): Promise<string | null> {
  if (!appCheck) return null;
  try {
    const tokenResult = await getAppCheckToken(appCheck, forceRefresh);
    const token = typeof tokenResult?.token === 'string' ? tokenResult.token.trim() : '';
    return token || null;
  } catch (error) {
    console.warn('App Check token unavailable:', error);
    return null;
  }
}
