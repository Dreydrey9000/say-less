import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useStudio, type VoiceAction } from "@/lib/studio";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { WorkingStatus } from "../ui/WorkingStatus";

/**
 * Turns what the user typed into a website address we can open, or null.
 * "calendly.com/you" becomes "https://calendly.com/you"; "calendly dot com"
 * is rejected.
 */
export function normalizeWebsite(input: string): string | null {
  const value = input.trim();
  if (!value || /\s/.test(value)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
    ? value
    : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    const host = url.hostname;
    if (host !== "localhost" && !/^[^.]+(\.[^.]+)+$/.test(host)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function VoiceActions() {
  const { t } = useTranslation();
  const { settings, loaded, busy, error, load, save } = useStudio();
  const [apps, setApps] = useState<string[]>([]);
  const [cue, setCue] = useState("");
  const [kind, setKind] = useState<VoiceAction["kind"]>("app");
  const [target, setTarget] = useState("");
  const [status, setStatus] = useState("");
  const [testing, setTesting] = useState(false);
  const [removed, setRemoved] = useState<VoiceAction[] | null>(null);
  const [urlError, setUrlError] = useState(false);
  // A ref, not state: a second click before React re-renders is still blocked.
  const saving = useRef(false);
  const targetId = "voice-action-target";
  const urlErrorId = "voice-action-url-error";
  useEffect(() => {
    void load();
    invoke<string[]>("list_launchable_apps")
      .then(setApps)
      .catch(() => setStatus(t("actions.failed")));
  }, [load, t]);
  async function guarded(action: () => Promise<void>) {
    if (saving.current) return;
    saving.current = true;
    try {
      await action();
    } finally {
      saving.current = false;
    }
  }
  function add() {
    const destination =
      kind === "website" ? normalizeWebsite(target) : target.trim();
    if (!destination) {
      setUrlError(true);
      document.getElementById(targetId)?.focus();
      return;
    }
    void guarded(async () => {
      if (
        await save({
          ...settings,
          actions: [
            ...settings.actions,
            { cue: cue.trim(), kind, target: destination },
          ],
        })
      ) {
        setCue("");
        setTarget("");
        setRemoved(null);
        setStatus(t("actions.saved"));
      }
    });
  }
  function remove(action: VoiceAction) {
    void guarded(async () => {
      const previous = settings.actions;
      if (
        await save({
          ...settings,
          actions: previous.filter((x) => x.cue !== action.cue),
        })
      ) {
        setRemoved(previous);
        setStatus(t("ux.actions.removed"));
      }
    });
  }
  function undoRemove() {
    const previous = removed;
    if (!previous) return;
    void guarded(async () => {
      if (await save({ ...useStudio.getState().settings, actions: previous })) {
        setRemoved(null);
        setStatus(t("actions.saved"));
      }
    });
  }
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <header>
        <p className="studio-eyebrow">{t("actions.eyebrow")}</p>
        <h1 className="text-2xl font-semibold">{t("actions.title")}</h1>
        <p className="text-sm text-text/70 mt-2">{t("actions.description")}</p>
      </header>
      <div className="studio-dock-setting">
        <p className="text-sm">{t("actions.activation")}</p>
        <Button
          aria-pressed={settings.actions_enabled}
          disabled={!loaded || busy}
          onClick={() =>
            void save({
              ...settings,
              actions_enabled: !settings.actions_enabled,
            })
          }
        >
          {t(settings.actions_enabled ? "actions.disable" : "actions.enable")}
        </Button>
      </div>
      {error && <p role="alert">{t("actions.invalid")}</p>}
      {status && <p role="status">{status}</p>}
      {removed && (
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={undoRemove}
        >
          {t("ux.actions.undo")}
        </Button>
      )}
      {(busy || testing) && <WorkingStatus label={t("actions.working")} />}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label className="block text-sm">
          {t("actions.cue")}
          <Input
            className="block w-full mt-1"
            aria-label={t("actions.cue")}
            value={cue}
            maxLength={80}
            onChange={(e) => setCue(e.target.value)}
            placeholder={t("actions.cueExample")}
          />
        </label>
        <label className="block text-sm">
          {t("actions.type")}
          <select
            className="studio-select mt-1"
            aria-label={t("actions.type")}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as VoiceAction["kind"]);
              setTarget("");
              setUrlError(false);
            }}
          >
            <option value="app">{t("actions.app")}</option>
            <option value="website">{t("actions.website")}</option>
          </select>
        </label>
        <label className="block text-sm">
          {t("actions.target")}
          {kind === "app" ? (
            <select
              className="studio-select mt-1"
              aria-label={t("actions.target")}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">{t("actions.chooseApp")}</option>
              {apps.map((a) => (
                <option key={a} value={a}>
                  {a
                    .split("/")
                    .pop()
                    ?.replace(/\.app$/, "")}
                </option>
              ))}
            </select>
          ) : (
            <Input
              id={targetId}
              inputMode="url"
              className="block w-full mt-1"
              aria-label={t("actions.target")}
              aria-invalid={urlError || undefined}
              aria-describedby={urlError ? urlErrorId : undefined}
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setUrlError(false);
              }}
              onBlur={() =>
                setUrlError(!!target.trim() && !normalizeWebsite(target))
              }
              placeholder="https://example.com"
            />
          )}
        </label>
        {kind === "website" && urlError && (
          <p id={urlErrorId} role="alert" className="text-sm text-error">
            {t("ux.actions.invalidUrl")}
          </p>
        )}
        <Button
          type="submit"
          aria-busy={busy}
          disabled={!loaded || busy || !cue.trim() || !target.trim()}
        >
          {t("actions.add")}
        </Button>
      </form>
      <ul className="space-y-3">
        {settings.actions.map((a) => (
          <li
            className="border border-mid-gray/20 rounded-xl p-4 space-y-2"
            key={a.cue}
          >
            <strong>{t("actions.say", { cue: a.cue })}</strong>
            <p className="text-sm text-text/70 break-all">{a.target}</p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={testing || busy}
                onClick={async () => {
                  setTesting(true);
                  try {
                    await invoke("test_voice_action", { cue: a.cue });
                    setStatus(t("actions.opened"));
                  } catch {
                    setStatus(t("actions.failed"));
                  } finally {
                    setTesting(false);
                  }
                }}
              >
                {t("actions.test")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                aria-label={t("actions.remove", { cue: a.cue })}
                onClick={() => remove(a)}
              >
                {t("snippets.remove")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {settings.actions.length === 0 && (
        <p className="text-sm text-text/70">{t("actions.empty")}</p>
      )}
    </div>
  );
}
