export default function PasswordVisibilityButton({
  visible,
  onToggle,
  multiple = false,
}: {
  visible: boolean;
  onToggle: () => void;
  multiple?: boolean;
}) {
  const label = `${visible ? "Hide" : "Show"} password${multiple ? "s" : ""}`;

  return (
    <button className="passwordVisibilityButton" type="button" onClick={onToggle} aria-label={label} title={label}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        {visible ? (
          <>
            <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.3A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-2.5 3.2M6.2 6.2C3.5 8.3 2 12 2 12s4 7 10 7a10 10 0 0 0 5.8-1.8" />
          </>
        ) : (
          <>
            <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </svg>
    </button>
  );
}
