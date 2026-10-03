/**
 * Which page of the Studio to show. A spoken "Create" voice action asks for a
 * page ("image", "titles", ...) before or after the Studio is on screen, so the
 * request is remembered once and the Studio picks it up when it mounts, or
 * hears the event if it is already open.
 */
export const STUDIO_VIEW_EVENT = "sayless:studio-view";

let pending: string | null = null;

export function requestStudioView(view: string) {
  pending = view;
  window.dispatchEvent(
    new CustomEvent<string>(STUDIO_VIEW_EVENT, { detail: view }),
  );
}

export function consumeStudioView(): string | null {
  const view = pending;
  pending = null;
  return view;
}
