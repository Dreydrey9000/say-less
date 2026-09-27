import {
  cloneElement,
  useEffect,
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
 * focus, hides on Escape (focused or just hovered) and after a click on the
 * control, and names the control through aria-labelledby, so sighted and
 * screen-reader users get the same words. Pure CSS positioning: no portal,
 * so it works in the tiny dock and overlay windows too.
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
  const [hovered, setHovered] = useState(false);
  // Escape while only hovering: the control has no focus, so listen on the
  // document until the pointer leaves.
  useEffect(() => {
    if (!hovered) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setDismissed(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [hovered]);
  const child = children as ReactElement<{
    onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  }>;
  return (
    <span
      className={`sl-tip-anchor ${className}`}
      data-placement={placement}
      data-align={align}
      data-dismissed={dismissed || undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setDismissed(false);
      }}
      // The click that uses the control is not a request to read its name,
      // and the tip would cover what the click just showed.
      onPointerDown={() => setDismissed(true)}
      onBlur={(event) => {
        // Still under the pointer (e.g. the control went disabled after a
        // click): keep a click's dismissal until the pointer leaves.
        if (!event.currentTarget.matches(":hover")) setDismissed(false);
      }}
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
