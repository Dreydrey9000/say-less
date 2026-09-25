import { useTranslation } from "react-i18next";

/** "Step 1 of 3" above each first-run screen, so people know how far along they are. */
export function OnboardingStepLabel({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  const { t } = useTranslation();
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
      {t("onboarding.step", { current, total })}
    </p>
  );
}
