import { createContext, useContext } from "react";
import type { SidebarSection } from "./Sidebar";

/** Lets any settings page send the user to another page (e.g. "Open Writing"). */
export const NavigateContext = createContext<(section: SidebarSection) => void>(
  () => {},
);

export const useNavigate = () => useContext(NavigateContext);
