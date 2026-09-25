import {
  cloneElement,
  useId,
  useState,
  type ReactElement,
  type KeyboardEvent,
} from "react";
import "./tooltip.css";

type Placement = "top" | "bottom" | "left" | "inside";
type Align = "center" | "start" | "end";

interface TooltipProps {
  /** Visible text. It also becomes the control's accessible name. */
  label: string;
  /** One focusable control, usually an icon-only button. */
  children: ReactElement;
  placement?: Placement;
  /** Horizontal alignment for top/bottom, so edge buttons stay on screen. */
  align?: Align;
  /** Extra class for the wrapper, e.g. to position it absolutely. */
  className?: string;
}

/**
 * A small tooltip for icon-only controls. It shows on hover and on keyboard
 * focus, hides on Escape, and names the control through aria-labelledby, so
 * sighted and screen-reader users get the same words. Pure CSS positioning:
 * no portal, so it works in the tiny dock and overlay windows too.
 */
export function Tooltip({
  label,
  children,
  placement = "top",
  align = "center",
  className = "",
}: TooltipProps) {
  const id = `tip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [dismissed, setDismissed] = useState(false);
  const child = children as ReactElement<{
    onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  }>;
  return (
    <span
      className={`sl-tip-anchor ${className}`}
      data-placement={placement}
      data-align={align}
      data-dismissed={dismissed || undefined}
      onMouseLeave={() => setDismissed(false)}
      onBlur={() => setDismissed(false)}
    >
      {cloneElement(child, {
        "aria-labelledby": id,
        onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
          if (event.key === "Escape") setDismissed(true);
          child.props.onKeyDown?.(event);
        },
      } as Record<string, unknown>)}
      <span role="tooltip" id={id} className="sl-tip">
        {label}
      </span>
    </span>
  );
}
