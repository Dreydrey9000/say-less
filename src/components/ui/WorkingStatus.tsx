export function WorkingStatus({ label }: { label: string }) {
  return (
    <span
      role="status"
      className="inline-flex items-center gap-2 text-sm text-text/75"
    >
      <span aria-hidden="true" className="thinking-orb" />
      {label}
    </span>
  );
}
