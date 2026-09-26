import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { commands, type UsageStats } from "@/bindings";

/** A typical typing speed, in words per minute. Time saved is words divided by
 * this. It is an assumption, so the screen says so next to the number. */
export const TYPING_WORDS_PER_MINUTE = 40;

/** Minutes a person would have spent typing `words` at the stated speed. */
export function minutesSaved(words: number): number {
  return words / TYPING_WORDS_PER_MINUTE;
}

/** "3 min", "1 h 5 min", "12 h". Under a minute rounds up to 1 so the tile is
 * never "0 min" next to a real word count. */
export function formatMinutes(
  minutes: number,
  t: (key: string, options?: Record<string, number>) => string,
): string {
  const whole = Math.max(1, Math.round(minutes));
  if (whole < 60) return t("home.stats.minutes", { n: whole });
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0
    ? t("home.stats.hours", { h: hours })
    : t("home.stats.hoursMinutes", { h: hours, m: rest });
}

/** Three numbers from the local history: words, an estimated time saved, and a
 * day streak. Hidden until there is at least one dictation, because a row of
 * zeros teaches nothing. */
export function HomeStats() {
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState<UsageStats | null>(null);
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      const result = await commands.getUsageStats();
      if (!disposed && result.status === "ok") setStats(result.data);
    };
    void refresh();
    const pending = listen("history-update-payload", () => void refresh());
    return () => {
      disposed = true;
      void pending.then((unlisten) => unlisten());
    };
  }, []);
  if (!stats || stats.dictations === 0) return null;
  const number = new Intl.NumberFormat(i18n.language);
  const tiles = [
    {
      id: "words",
      value: number.format(stats.words),
      label: t("home.stats.words"),
    },
    {
      id: "saved",
      value: formatMinutes(minutesSaved(stats.words), t),
      label: t("home.stats.saved"),
    },
    {
      id: "streak",
      value: number.format(stats.streak_days),
      label: t("home.stats.streak"),
    },
  ];
  return (
    <section
      className="home-stats"
      aria-labelledby="home-stats-title"
      data-testid="home-stats"
    >
      <h2 id="home-stats-title">{t("home.stats.title")}</h2>
      <dl>
        {tiles.map((tile) => (
          <div key={tile.id} className="home-stat">
            <dd>{tile.value}</dd>
            <dt>{tile.label}</dt>
          </div>
        ))}
      </dl>
      <p className="home-stats-note">
        {t("home.stats.note", {
          wpm: TYPING_WORDS_PER_MINUTE,
          dictations: number.format(stats.dictations),
        })}
      </p>
    </section>
  );
}
