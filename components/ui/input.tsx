import type { InputHTMLAttributes } from "react";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`field-control h-10 w-full rounded-md border border-[#eae2e0] bg-white px-3 text-xs outline-none transition placeholder:text-[#b9afad] focus-visible:border-[#cc8493] focus-visible:ring-2 focus-visible:ring-[#bd61771c] disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()}
      {...props}
    />
  );
}
