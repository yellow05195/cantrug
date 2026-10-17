/** Loading state: three dashes lighting in sequence, like a mechanical indicator. Never a spinner. */
export function Dashes({ label = "Working" }: { label?: string }) {
  return (
    <span role="status" aria-label={label} className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden
          className="block h-[2px] w-2.5 bg-current motion-safe:animate-[dash-step_720ms_linear_infinite]"
          style={{ animationDelay: `${i * 240}ms` }}
        />
      ))}
    </span>
  );
}
