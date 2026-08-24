import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className = "", ...props }: CardProps) {
  return (
    <div
      className={`rounded-3xl border border-[#dfe9e6] bg-white shadow-[0_8px_30px_rgba(24,59,69,0.05)] ${className}`}
      {...props}
    />
  );
}
