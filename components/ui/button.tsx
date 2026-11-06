import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive";

const variantClasses: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground shadow-sm hover:bg-[#9e4b62]",
  secondary: "bg-[#f8f2f1] text-[#554849] hover:bg-[#f1e8e7]",
  outline: "border border-border bg-white hover:bg-[#faf7f6]",
  ghost: "hover:bg-[#f8eeee] hover:text-[#9e4b62]",
  destructive: "bg-[#b95158] text-white hover:bg-[#9d3e45]",
};

export function Button({
  className = "",
  variant = "default",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bd61771c] disabled:pointer-events-none disabled:opacity-50 ${variantClasses[variant]} ${className}`.trim()}
      {...props}
    />
  );
}
