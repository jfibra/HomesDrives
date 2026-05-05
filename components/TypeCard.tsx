import Link from "next/link";

type TypeCardProps = {
  title: string;
  icon: string;
  link: string;
  isActive?: boolean;
};

export default function TypeCard({
  title,
  icon,
  link,
  isActive = false,
}: TypeCardProps) {
  return (
    <Link href={link}>
      <div
        className={`group relative rounded-3xl border-2 p-8 transition-all duration-300 cursor-pointer
          ${
            isActive
              ? "border-[#b52426] bg-[#b52426] text-white shadow-lg scale-105"
              : "border-[#c4c6cf] bg-white text-[#121c2c] hover:border-[#002045] hover:shadow-xl hover:scale-105"
          }
        `}
      >
        {/* Icon/Placeholder */}
        <div
          className={`mb-6 flex h-20 w-20 items-center justify-center rounded-2xl transition-all duration-300
            ${
              isActive
                ? "bg-white bg-opacity-20"
                : "bg-[#f0f3ff] group-hover:bg-[#002045] group-hover:text-white"
            }
          `}
        >
          <span className="text-4xl">{icon}</span>
        </div>

        {/* Title */}
        <h3 className="text-xl font-bold">{title}</h3>

        {/* Active indicator */}
        {isActive && (
          <div className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-[#b52426] flex items-center justify-center text-white font-bold text-sm">
            ✓
          </div>
        )}

        {/* Hover arrow */}
        <div
          className={`mt-4 inline-flex items-center gap-2 text-sm font-semibold transition-all duration-300
            ${
              isActive
                ? "text-white"
                : "text-[#002045] group-hover:text-[#002045] group-hover:gap-3"
            }
          `}
        >
          Select
          <span>→</span>
        </div>
      </div>
    </Link>
  );
}
