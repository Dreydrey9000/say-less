import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";

interface Connections {
  auto_titles_enabled: boolean;
  watch_enabled: boolean;
  b2_bucket: string;
  b2_secrets_file: string;
  drive_enabled: boolean;
  drive_remote: string;
  image_tool: boolean;
  cloud_tool: boolean;
  drive_tool: boolean;
  cloud_credentials: boolean;
}

export function StudioConnections() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<Connections>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  useEffect(() => {
    let active = true;
    invoke<string>("creative_studio_connections", { settings: null })
      .then((value) => {
        if (active) setSettings(JSON.parse(value) as Connections);
      })
      .catch(() => {
        if (active) setMessage("creative.connectionsFailed");
      });
    return () => {
      active = false;
    };
  }, []);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!settings || busy) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const value = await invoke<string>("creative_studio_connections", {
        settings: JSON.stringify(settings),
      });
      setSettings(JSON.parse(value) as Connections);
      setMessage("creative.saved");
    } catch {
      setMessage("creative.connectionsFailed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="creative-connections">
      <summary>{t("creative.connections")}</summary>
      <p>{t("creative.connectionHelp")}</p>
      {settings && (
        <form onSubmit={save}>
          <p>
            {t(
              settings.image_tool
                ? "creative.imageReady"
                : "creative.imageMissing",
            )}
          </p>
          <label>
            <input
              type="checkbox"
              checked={settings.auto_titles_enabled ?? false}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  auto_titles_enabled: e.target.checked,
                })
              }
              disabled={busy}
            />
            {t("creative.autoTitles")}
          </label>
          <p>
            {t(
              settings.cloud_tool && settings.cloud_credentials
                ? "creative.cloudReady"
                : "creative.cloudMissing",
            )}
          </p>
          <label>
            {t("creative.bucket")}
            <input
              value={settings.b2_bucket}
              onChange={(e) =>
                setSettings({ ...settings, b2_bucket: e.target.value })
              }
              disabled={busy}
            />
          </label>
          <label>
            {t("creative.credentials")}
            <input
              value={settings.b2_secrets_file}
              onChange={(e) =>
                setSettings({ ...settings, b2_secrets_file: e.target.value })
              }
              disabled={busy}
              spellCheck={false}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.watch_enabled}
              onChange={(e) =>
                setSettings({ ...settings, watch_enabled: e.target.checked })
              }
              disabled={busy}
            />
            {t("creative.autoUpload")}
          </label>
          <label>
            {t("creative.driveRemote")}
            <input
              value={settings.drive_remote}
              onChange={(e) =>
                setSettings({ ...settings, drive_remote: e.target.value })
              }
              disabled={busy}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.drive_enabled}
              onChange={(e) =>
                setSettings({ ...settings, drive_enabled: e.target.checked })
              }
              disabled={busy}
            />
            {t("creative.driveMirror")}
          </label>
          <button
            type="submit"
            disabled={busy}
            className="brand-action rounded-lg px-4 py-2"
          >
            {t(busy ? "creative.saving" : "creative.save")}
          </button>
        </form>
      )}
      {message && <p role="status">{t(message)}</p>}
    </details>
  );
}
