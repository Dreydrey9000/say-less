import { useTranslation } from "react-i18next";

export default function SayLessLogo({
  width = 200,
  className = "",
}: {
  width?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={`flex items-center gap-3 max-w-full ${className}`}
      style={{ width }}
    >
      <img
        src="/brand/say-less-emblem.png"
        alt=""
        width={48}
        height={48}
        className="w-1/4 shrink-0 rounded-xl"
      />
      <span
        className="font-semibold tracking-tight text-text leading-none"
        style={{ fontSize: width / 8 }}
      >
        {t("brand.name")}
      </span>
    </div>
  );
}
