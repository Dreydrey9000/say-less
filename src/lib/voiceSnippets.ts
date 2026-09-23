import { commands, type VoiceSnippet, type Result } from "@/bindings";
export type { VoiceSnippet } from "@/bindings";

function unwrap<T>(result: Result<T, string>): T {
  if (result.status === "error") throw result.error;
  return result.data;
}

export const voiceSnippets = {
  list: async () => unwrap(await commands.listVoiceSnippets()),
  save: async (snippets: VoiceSnippet[]) =>
    unwrap(await commands.saveVoiceSnippets(snippets)),
  preview: async (text: string, snippets: VoiceSnippet[]) =>
    unwrap(await commands.previewVoiceSnippets(text, snippets)),
};
