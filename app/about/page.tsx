import Navbar from "@/components/Navbar";

export default function AboutPage() {
  return (
    <div
      style={{
        backgroundColor: "#f9f9ff",
        color: "#121c2c",
        minHeight: "100vh",
      }}
    >
      <Navbar />

      {/* Hero Section */}
      <section className="pt-32" style={{ backgroundColor: "#f0f3ff" }}>
        <div className="mx-auto max-w-[1280px] px-8 py-20">
          <div className="space-y-6">
            <p
              className="inline-block text-xs font-semibold uppercase tracking-[0.2em]"
              style={{ color: "#b52426" }}
            >
              Our Story
            </p>
            <h1
              className="text-5xl font-bold leading-tight lg:text-6xl"
              style={{ color: "#002045" }}
            >
              About Homes.ph Drive
            </h1>
            <p
              className="text-xl leading-relaxed max-w-3xl"
              style={{ color: "#43474e" }}
            >
              A revolutionary marketplace connecting premium real estate
              photographers with buyers, investors, and brokers across the
              Philippines and beyond.
            </p>
          </div>
        </div>
      </section>

      {/* Mission & Vision Section */}
      <section className="py-20" style={{ backgroundColor: "#ffffff" }}>
        <div className="mx-auto max-w-[1280px] px-8">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
            {/* Mission */}
            <div className="space-y-4">
              <h2 className="text-3xl font-bold" style={{ color: "#002045" }}>
                Our Mission
              </h2>
              <p
                className="text-lg leading-relaxed"
                style={{ color: "#43474e" }}
              >
                To empower real estate professionals by providing access to
                high-quality, curated photography that elevates property
                presentations and accelerates sales cycles.
              </p>
              <p
                className="text-lg leading-relaxed"
                style={{ color: "#43474e" }}
              >
                We believe that exceptional imagery transforms how properties
                are perceived, and we're committed to making premium photography
                accessible to everyone in the real estate industry.
              </p>
            </div>

            {/* Vision */}
            <div className="space-y-4">
              <h2 className="text-3xl font-bold" style={{ color: "#002045" }}>
                Our Vision
              </h2>
              <p
                className="text-lg leading-relaxed"
                style={{ color: "#43474e" }}
              >
                To become the leading marketplace for real estate photography in
                Southeast Asia, where quality meets accessibility and innovation
                drives every transaction.
              </p>
              <p
                className="text-lg leading-relaxed"
                style={{ color: "#43474e" }}
              >
                We envision a future where professional photographers are fairly
                compensated, real estate professionals have instant access to
                stunning imagery, and every property is showcased in its best
                light.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section
        className="py-20"
        style={{
          backgroundColor: "#f9f9ff",
          borderTop: "1px solid #c4c6cf",
          borderBottom: "1px solid #c4c6cf",
        }}
      >
        <div className="mx-auto max-w-[1280px] px-8">
          <h2
            className="mb-12 text-4xl font-bold text-center"
            style={{ color: "#002045" }}
          >
            Our Core Values
          </h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "Quality",
                description:
                  "We curate only the finest photography that meets our rigorous standards.",
                icon: "✓",
              },
              {
                title: "Integrity",
                description:
                  "Fair pricing, transparent practices, and honest partnerships define us.",
                icon: "⚖",
              },
              {
                title: "Innovation",
                description:
                  "We continuously improve our platform to serve our community better.",
                icon: "💡",
              },
              {
                title: "Community",
                description:
                  "We support photographers and professionals as partners, not just users.",
                icon: "🤝",
              },
            ].map((value) => (
              <div
                key={value.title}
                className="rounded-2xl p-6"
                style={{
                  border: "1px solid #c4c6cf",
                  backgroundColor: "#ffffff",
                }}
              >
                <div className="text-4xl mb-3" style={{ color: "#b52426" }}>
                  {value.icon}
                </div>
                <h3
                  className="text-xl font-bold mb-2"
                  style={{ color: "#002045" }}
                >
                  {value.title}
                </h3>
                <p style={{ color: "#43474e" }}>{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-20">
        <div className="mx-auto max-w-[1280px] px-8">
          <h2
            className="mb-12 text-4xl font-bold text-center"
            style={{ color: "#002045" }}
          >
            Why Choose Homes.ph Drive?
          </h2>
          <div className="space-y-6">
            {[
              {
                title: "Curated Collection",
                description:
                  "Every photo is vetted for quality, ensuring you get only premium imagery.",
              },
              {
                title: "Easy Search & Filters",
                description:
                  "Find exactly what you need with advanced filtering by location, style, and more.",
              },
              {
                title: "Competitive Pricing",
                description:
                  "Fair rates for both buyers and photographers. Transparent, no hidden fees.",
              },
              {
                title: "Dedicated Support",
                description:
                  "Our team is here to help you succeed, whether you're buying or selling.",
              },
              {
                title: "Growing Network",
                description:
                  "Join thousands of professionals using Homes.ph Drive every month.",
              },
              {
                title: "Local Expertise",
                description:
                  "Deep knowledge of Philippine real estate and photography markets.",
              },
            ].map((item, index) => (
              <div key={index} className="flex gap-4">
                <div
                  className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: "#b52426",
                    color: "#ffffff",
                    fontWeight: "bold",
                  }}
                >
                  {index + 1}
                </div>
                <div>
                  <h3
                    className="font-bold text-lg"
                    style={{ color: "#002045" }}
                  >
                    {item.title}
                  </h3>
                  <p style={{ color: "#43474e" }}>{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section
        className="py-16"
        style={{
          backgroundColor: "#002045",
        }}
      >
        <div className="mx-auto max-w-[1280px] px-8 text-center">
          <h2 className="text-4xl font-bold mb-6 text-white">
            Ready to Explore?
          </h2>
          <p className="text-lg mb-8 text-white" style={{ opacity: 0.9 }}>
            Join our community of real estate professionals and discover
            exceptional photography.
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: "#b52426" }}
          >
            Browse Marketplace
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ backgroundColor: "#002045" }}>
        <div className="mx-auto max-w-[1280px] px-8 py-12 text-center">
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
            © {new Date().getFullYear()} homes.ph · All rights reserved
          </p>
        </div>
      </footer>
    </div>
  );
}
