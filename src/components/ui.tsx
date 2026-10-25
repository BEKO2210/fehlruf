import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

const buttonStyles = {
  primary: "bg-primary text-primary-foreground h-12",
  muted: "bg-muted text-foreground h-12",
  ghost: "border border-border bg-transparent text-foreground h-12",
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
      className={`press inline-flex items-center justify-center gap-2 rounded-sm px-4 text-base font-medium disabled:pointer-events-none disabled:opacity-40 ${buttonStyles[variant]} ${full ? "w-full" : ""} ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="text-sm text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

const control =
  "h-12 w-full rounded-sm border border-border bg-background px-3 text-base outline-none placeholder:text-subtle";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${control} ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-md border border-border bg-background px-3 py-3 text-base outline-none placeholder:text-subtle ${props.className ?? ""}`}
    />
  );
}
