"use client";

import Link from "next/link";
import Navbar from "@/components/Navbar";

type PageProps = {
  params: {
    id: string;
    category: string;
  };
};

const CATEGORY_DETAILS: Record<
  string,
  { title: string; description: string; icon: string }
> = {
  news: {
    title: "News",
    description:
      "Stay updated with the latest news and trending stories relevant to your interests.",
    icon: "📰",
  },
  restaurants: {
    title: "Restaurants",
    description:
      "Discover amazing dining experiences, from local favorites to fine dining establishments.",
    icon: "🍽️",
  },
  event: {
    title: "Events",
    description:
      "Explore upcoming events, conferences, and gatherings in your area.",
    icon: "🎉",
  },
  hotels: {
    title: "Hotels",
    description:
      "Find the perfect accommodation for your stay with our curated hotel recommendations.",
    icon: "🏨",
  },
  schools: {
    title: "Schools",
    description:
      "Browse educational institutions and learning opportunities for all ages.",
    icon: "🎓",
  },
};

export default function CategoryPage({ params }: PageProps) {
  const { id, category } = params;
  const details = CATEGORY_DETAILS[category] || {
    title: category,
    description: "Exploring this category",
    icon: "📌",
  };

  return (
    <div
      style={{
        backgroundColor: "#f9f9ff",
        color: "#121c2c",
        minHeight: "100vh",
      }}
    >
      <Navbar />

      <section className="pt-20">
        <div className="mx-auto max-w-7xl px-8 py-20">
          {/* Back Button */}
          <Link
            href={`/app/${id}/type`}
            className="mb-8 inline-flex items-center gap-2 text-sm font-semibold transition hover:opacity-70"
            style={{ color: "#002045" }}
          >
            <span>←</span> Back to Selection
          </Link>

          {/* Header */}
          <div className="mb-12">
            <div
              className="mb-6 inline-flex h-24 w-24 items-center justify-center rounded-2xl"
              style={{ backgroundColor: "#f0f3ff" }}
            >
              <span className="text-5xl">{details.icon}</span>
            </div>

            <h1
              className="mb-4 text-5xl font-bold leading-tight"
              style={{ color: "#002045" }}
            >
              {details.title}
            </h1>

            <div className="space-y-2">
              <p className="text-lg" style={{ color: "#43474e" }}>
                {details.description}
              </p>
              <p className="text-base" style={{ color: "#74777f" }}>
                Selected for user ID:{" "}
                <span className="font-semibold">{id}</span>
              </p>
            </div>
          </div>

          {/* Content Grid */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl border transition hover:shadow-lg"
                style={{ borderColor: "#c4c6cf", backgroundColor: "#ffffff" }}
              >
                <div
                  className="h-40 flex items-center justify-center text-3xl"
                  style={{ backgroundColor: "#f0f3ff" }}
                >
                  {details.icon}
                </div>
                <div className="p-6">
                  <h3
                    className="mb-2 text-base font-bold"
                    style={{ color: "#002045" }}
                  >
                    {details.title} Item {i + 1}
                  </h3>
                  <p style={{ color: "#43474e" }}>
                    This is a sample {details.title.toLowerCase()} entry
                    showcasing the content structure.
                  </p>
                  <button
                    className="mt-4 inline-flex items-center gap-2 text-sm font-semibold transition hover:opacity-70"
                    style={{ color: "#b52426" }}
                  >
                    Learn More →
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Call to Action */}
          <div
            className="mt-16 rounded-2xl p-8 text-center"
            style={{
              backgroundColor: "#002045",
              color: "#ffffff",
            }}
          >
            <h2 className="mb-4 text-3xl font-bold">Ready to get started?</h2>
            <p className="mb-6" style={{ color: "rgba(255,255,255,0.85)" }}>
              Choose another category or configure your preferences to continue.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                href={`/app/${id}/type`}
                className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition hover:opacity-90"
                style={{ backgroundColor: "#b52426", color: "#ffffff" }}
              >
                Select Different Category
              </Link>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-full border px-6 py-3 text-sm font-semibold transition hover:opacity-70"
                style={{
                  borderColor: "rgba(255,255,255,0.3)",
                  color: "#ffffff",
                }}
              >
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
