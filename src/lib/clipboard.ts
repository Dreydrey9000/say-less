import { writeText } from "@tauri-apps/plugin-clipboard-manager";

/**
 * Copies text with the app's native clipboard first, then the browser API.
 * Throws only when both fail, so callers can show a plain "couldn't copy"
 * message instead of silently doing nothing.
 */
export async function copyText(text: string): Promise<void> {
  try {
    await writeText(text);
    return;
  } catch (nativeError) {
    console.warn(
      "Native clipboard write failed, trying the browser:",
      nativeError,
    );
  }
  await navigator.clipboard.writeText(text);
}
