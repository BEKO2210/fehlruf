import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

const buttonStyles = {
  primary: "bg-brand-fill text-brand-ink h-14 text-base font-semibold",
  muted: "bg-surface-2 text-text h-12 text-base font-medium",
  ghost: "border border-line bg-transparent text-text h-12 text-base font-medium",
} as const;

export function Button({
  variant = "primary",
  full = false,
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonStyles;
  full?: boolean;
}) {
  return (
    <button
      type={type}
      className={`press inline-flex items-center justify-center gap-2 rounded-2xl px-5 disabled:pointer-events-none disabled:!bg-surface-2 disabled:!text-muted ${buttonStyles[variant]} ${full ? "w-full" : ""} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="flex items-baseline justify-between gap-2 text-sm font-semibold text-text">
        {label}
        {hint ? <span className="text-xs font-normal text-subtle">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

const control =
  "h-14 w-full rounded-2xl border border-line bg-surface px-4 text-base outline-none transition-colors placeholder:text-subtle focus:border-brand";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${control} ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-2xl border border-line bg-surface px-4 py-3 text-base outline-none transition-colors placeholder:text-subtle focus:border-brand ${props.className ?? ""}`}
    />
  );
}

export function Chip({
  active,
  children,
  onClick,
  size = "md",
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
  size?: "md" | "lg";
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`press shrink-0 rounded-full px-4 font-medium ${size === "lg" ? "h-14 text-base" : "h-12 text-sm"} ${
        active ? "bg-brand-fill text-brand-ink" : "border border-line bg-surface text-text"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div>
      <h1 className="text-[28px] leading-tight font-bold tracking-tight">{title}</h1>
      {sub ? <p className="mt-1 text-base text-muted">{sub}</p> : null}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-2xl bg-hot-soft px-4 py-3 text-sm font-medium text-hot">
      {children}
    </p>
  );
}
