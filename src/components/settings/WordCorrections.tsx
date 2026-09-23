import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useStudio } from "@/lib/studio";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";

export function WordCorrections() {
  const { t } = useTranslation();
  const { settings, save, busy, loaded } = useStudio();
  const [heard, setHeard] = useState("");
  const [wanted, setWanted] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{t("corrections.title")}</h2>
      <p className="text-sm text-text/70">{t("corrections.description")}</p>
      {duplicate && <p role="alert">{t("corrections.duplicate")}</p>}
      <form
        className="correction-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            settings.corrections.some(
              (c) => c.trigger.toLowerCase() === heard.trim().toLowerCase(),
            )
          ) {
            setDuplicate(true);
            return;
          }
          setDuplicate(false);
          if (
            await save({
              ...settings,
              corrections: [
                ...settings.corrections,
                { trigger: heard.trim(), expansion: wanted.trim() },
              ],
            })
          ) {
            setHeard("");
            setWanted("");
          }
        }}
      >
        <label>
          {t("corrections.heard")}
          <Input
            required
            maxLength={80}
            value={heard}
            onChange={(e) => setHeard(e.target.value)}
          />
        </label>
        <label>
          {t("corrections.wanted")}
          <Input
            required
            maxLength={120}
            value={wanted}
            onChange={(e) => setWanted(e.target.value)}
          />
        </label>
        <Button
          type="submit"
          disabled={!loaded || busy || !heard.trim() || !wanted.trim()}
        >
          {t("corrections.save")}
        </Button>
      </form>
      <ul>
        {settings.corrections.map((c) => (
          <li key={c.trigger} className="correction-row">
            <span>
              {c.trigger} → <strong>{c.expansion}</strong>
            </span>
            <Button
              variant="secondary"
              disabled={busy}
              aria-label={t("corrections.remove", { word: c.trigger })}
              onClick={() =>
                void save({
                  ...settings,
                  corrections: settings.corrections.filter(
                    (item) => item.trigger !== c.trigger,
                  ),
                })
              }
            >
              {t("snippets.remove")}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
