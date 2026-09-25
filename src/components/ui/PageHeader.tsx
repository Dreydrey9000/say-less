import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  children?: ReactNode;
}

/** One page title pattern: optional eyebrow, 28px H1, one-line subtitle. */
export function PageHeader({
  title,
  description,
  eyebrow,
  children,
}: PageHeaderProps) {
  return (
    <header className="page-header">
      {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {description && <p className="page-subtitle">{description}</p>}
      {children}
    </header>
  );
}
