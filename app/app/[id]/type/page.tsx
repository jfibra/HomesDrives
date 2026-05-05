"use client";

import { useState } from "react";
import TypeCard from "@/components/TypeCard";
import Navbar from "@/components/Navbar";

type PageProps = {
  params: {
    id: string;
  };
};

const TYPES = [
  {
    id: "news",
    title: "News",
    icon: "📰",
  },
  {
    id: "restaurants",
    title: "Restaurants",
    icon: "🍽️",
  },
  {
    id: "event",
    title: "Event",
    icon: "🎉",
  },
  {
    id: "hotels",
    title: "Hotels",
    icon: "🏨",
  },
  {
    id: "schools",
    title: "Schools",
    icon: "🎓",
  },
];

export default function SelectTypePage({ params }: PageProps) {
  const { id } = params;
  const [selectedType, setSelectedType] = useState<string | null>(null);

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
        <div className="mx-auto max-w-4xl px-8 py-20">
          {/* Header */}
          <div className="mb-16 text-center">
            <p
              className="mb-2 text-xs font-semibold uppercase tracking-[0.2em]"
              style={{ color: "#b52426" }}
            >
              Step 2 of 3
            </p>
            <h1
              className="mb-4 text-5xl font-bold leading-tight"
              style={{ color: "#002045" }}
            >
              Select Type
            </h1>
            <p className="text-lg" style={{ color: "#43474e" }}>
              User ID: <span className="font-semibold">{id}</span>
            </p>
            <p className="mt-3 text-base" style={{ color: "#74777f" }}>
              Choose the category that best fits your needs
            </p>
          </div>

          {/* Type Selection Grid */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {TYPES.map((type) => (
              <div
                key={type.id}
                onClick={() => setSelectedType(type.id)}
                className="transition-all duration-300"
              >
                <TypeCard
                  title={type.title}
                  icon={type.icon}
                  link={`/app/${id}/type/${type.id}`}
                  isActive={selectedType === type.id}
                />
              </div>
            ))}
          </div>

          {/* Info Section */}
          <div
            className="mt-16 rounded-2xl p-8"
            style={{
              backgroundColor: "#f0f3ff",
              border: "1px solid #c4c6cf",
            }}
          >
            <h3 className="mb-3 text-lg font-bold" style={{ color: "#002045" }}>
              How it works
            </h3>
            <ul className="space-y-2 text-base" style={{ color: "#43474e" }}>
              <li>✓ Select one of the categories above to explore content</li>
              <li>✓ Your selection will be saved to your profile</li>
              <li>✓ You can change your selection at any time</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
