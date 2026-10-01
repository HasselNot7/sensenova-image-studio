/** SenseNova 官方 wordmark（public/brand/sensenova.png，蓝绿彩色，深浅底都可读）。 */
export function SensenovaLogo({ className }: { className?: string }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      alt="SenseNova"
      className={`object-contain ${className ?? ""}`}
      decoding="async"
      height={54}
      src="/brand/sensenova.png"
      width={100}
    />
  );
}
