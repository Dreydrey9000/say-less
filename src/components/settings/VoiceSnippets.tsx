import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { voiceSnippets, type VoiceSnippet } from "../../lib/voiceSnippets";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Textarea } from "../ui/Textarea";
import { WorkingStatus } from "../ui/WorkingStatus";

export function VoiceSnippets() {
  const { t } = useTranslation();
  const [snippets, setSnippets] = useState<VoiceSnippet[]>([]);
  const [undo, setUndo] = useState<VoiceSnippet[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [trigger, setTrigger] = useState("");
  const [expansion, setExpansion] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [sample, setSample] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const load = async () => {
    setBusy(true);
    setError("");
    try {
      setSnippets(await voiceSnippets.list());
      setLoaded(true);
    } catch {
      setError(t("snippets.errors.storage"));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const reset = () => {
    setEditing(null);
    setTrigger("");
    setExpansion("");
  };
  const persist = async (next: VoiceSnippet[]) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await voiceSnippets.save(next);
      setSnippets(next);
      setUndo(null);
      reset();
      setPreview(null);
      setMessage(t("snippets.saved"));
      return true;
    } catch (reason) {
      const code =
        typeof reason === "string" &&
        [
          "duplicate",
          "invalid_trigger",
          "invalid_expansion",
          "too_many",
        ].includes(reason)
          ? reason
          : "storage";
      setError(t(`snippets.errors.${code}`));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    const entry = { trigger: trigger.trim(), expansion };
    void persist(
      editing === null
        ? [...snippets, entry]
        : snippets.map((s, index) => (index === editing ? entry : s)),
    );
  };
  const tryPreview = async () => {
    setBusy(true);
    setError("");
    try {
      setPreview(await voiceSnippets.preview(sample, snippets));
    } catch {
      setError(t("snippets.errors.preview"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-5" aria-labelledby="snippets-title">
      <div>
        <h2 id="snippets-title" className="text-lg font-semibold">
          {t("snippets.title")}
        </h2>
        <p className="text-sm text-text/70 mt-1">{t("snippets.description")}</p>
      </div>
      <p className="rounded-xl border border-mid-gray/20 bg-mid-gray/5 p-3 text-sm text-text/75">
        {t("snippets.privacy")}
      </p>
      {error && (
        <div role="alert" className="text-error text-sm">
          <p>{error}</p>
          {!loaded && (
            <Button
              variant="secondary"
              onClick={() => void load()}
              disabled={busy}
            >
              {t("snippets.retry")}
            </Button>
          )}
        </div>
      )}
      {busy && <WorkingStatus label={t("snippets.working")} />}
      {message && (
        <p role="status" className="text-sm text-text/75">
          {message}
        </p>
      )}
      {undo && (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void persist(undo)}
        >
          {t("snippets.undo")}
        </Button>
      )}
      {loaded && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            className="space-y-3 rounded-xl border border-mid-gray/20 p-4"
          >
            <h3 className="font-medium">
              {t(editing === null ? "snippets.add" : "snippets.edit")}
            </h3>
            <div className="space-y-1">
              <label htmlFor="snippet-trigger" className="block text-sm">
                {t("snippets.trigger")}
              </label>
              <Input
                id="snippet-trigger"
                className="w-full"
                value={trigger}
                onChange={(e) => setTrigger(e.target.value)}
                maxLength={80}
                placeholder={t("snippets.triggerExample")}
                disabled={busy}
                required
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="snippet-expansion" className="block text-sm">
                {t("snippets.expansion")}
              </label>
              <Textarea
                id="snippet-expansion"
                className="w-full"
                value={expansion}
                onChange={(e) => setExpansion(e.target.value)}
                maxLength={4000}
                placeholder={t("snippets.expansionExample")}
                disabled={busy}
                required
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={
                  busy ||
                  !trigger.trim() ||
                  !expansion.trim() ||
                  (editing === null && snippets.length >= 100)
                }
              >
                {t("snippets.save")}
              </Button>
              {editing !== null && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={reset}
                  disabled={busy}
                >
                  {t("snippets.cancel")}
                </Button>
              )}
            </div>
          </form>
          {snippets.length === 0 ? (
            <p className="text-sm text-text/70">{t("snippets.empty")}</p>
          ) : (
            <ul className="space-y-3">
              {snippets.map((snippet, index) => (
                <li
                  key={snippet.trigger}
                  className="rounded-xl border border-mid-gray/20 p-4 space-y-2"
                >
                  <p className="font-medium break-words">{snippet.trigger}</p>
                  <p className="text-sm text-text/70 whitespace-pre-wrap break-words max-h-40 overflow-y-auto select-text">
                    {snippet.expansion}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      aria-label={t("snippets.editNamed", {
                        trigger: snippet.trigger,
                      })}
                      onClick={() => {
                        setEditing(index);
                        setTrigger(snippet.trigger);
                        setExpansion(snippet.expansion);
                        setMessage("");
                        document.getElementById("snippet-trigger")?.focus();
                      }}
                    >
                      {t("snippets.edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger-ghost"
                      disabled={busy}
                      aria-label={t("snippets.removeNamed", {
                        trigger: snippet.trigger,
                      })}
                      onClick={async () => {
                        const previous = snippets;
                        if (
                          await persist(snippets.filter((_, i) => i !== index))
                        ) {
                          setUndo(previous);
                        }
                      }}
                    >
                      {t("snippets.remove")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-2 border-t border-mid-gray/20 pt-4">
            <label htmlFor="snippet-preview" className="block font-medium">
              {t("snippets.tryTitle")}
            </label>
            <p className="text-sm text-text/70">
              {t("snippets.tryDescription")}
            </p>
            <Input
              id="snippet-preview"
              value={sample}
              onChange={(e) => {
                setSample(e.target.value);
                setPreview(null);
              }}
              className="w-full"
              maxLength={4000}
              disabled={busy}
            />
            <Button
              variant="secondary"
              disabled={busy || !sample.trim()}
              onClick={() => void tryPreview()}
            >
              {t("snippets.preview")}
            </Button>
            {preview !== null && (
              <output
                className="block whitespace-pre-wrap break-words rounded-xl bg-mid-gray/10 p-3 text-sm select-text"
                aria-live="polite"
              >
                {preview}
              </output>
            )}
          </div>
        </>
      )}
    </section>
  );
}
