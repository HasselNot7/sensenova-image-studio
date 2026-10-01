"use client";

/** 蒸馏模型的自有标记：圆底蒸馏瓶 + 液面 + 气泡，描边走 currentColor。 */
export function DistillMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className ?? "size-6"}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.6}
      viewBox="0 0 24 24"
    >
      <path d="M9.4 2.9h5.2" />
      <path d="M10.8 2.9v5.3L6 16.7a2.6 2.6 0 0 0 2.3 3.9h7.4a2.6 2.6 0 0 0 2.3-3.9l-4.8-8.5V2.9" />
      <path d="M7.7 14.5h8.6" />
      <circle cx="10.7" cy="17.2" r=".95" />
      <circle cx="13.7" cy="18.4" r=".6" />
    </svg>
  );
}
