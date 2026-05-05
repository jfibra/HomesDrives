"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Here you would typically send the data to a backend
    console.log("Form submitted:", formData);
    setSubmitted(true);
    setFormData({ name: "", email: "", message: "" });
    setTimeout(() => setSubmitted(false), 5000);
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

      {/* Hero Section */}
      <section className="pt-32" style={{ backgroundColor: "#f0f3ff" }}>
        <div className="mx-auto max-w-[1280px] px-8 py-20">
          <div className="space-y-6 text-center">
            <p
              className="inline-block text-xs font-semibold uppercase tracking-[0.2em]"
              style={{ color: "#b52426" }}
            >
              Get In Touch
            </p>
            <h1
              className="text-5xl font-bold leading-tight lg:text-6xl"
              style={{ color: "#002045" }}
            >
              Contact Us
            </h1>
            <p
              className="text-xl leading-relaxed max-w-2xl mx-auto"
              style={{ color: "#43474e" }}
            >
              Have a question or feedback? We&apos;d love to hear from you. Get
              in touch with our team.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-20">
        <div className="mx-auto max-w-[1280px] px-8">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
            {/* Contact Information */}
            <div className="space-y-8">
              <div>
                <h2
                  className="text-3xl font-bold mb-8"
                  style={{ color: "#002045" }}
                >
                  Contact Information
                </h2>
              </div>

              {[
                {
                  title: "Email",
                  content: "support@homes.ph",
                  icon: "✉",
                },
                {
                  title: "Phone",
                  content: "+63 (02) 1234-5678",
                  icon: "📞",
                },
                {
                  title: "Address",
                  content: "Manila, Philippines",
                  icon: "📍",
                },
                {
                  title: "Business Hours",
                  content: "Monday - Friday: 9AM - 6PM (PST)",
                  icon: "⏰",
                },
              ].map((item, index) => (
                <div key={index} className="flex gap-4">
                  <div
                    className="text-3xl flex-shrink-0"
                    style={{ color: "#b52426" }}
                  >
                    {item.icon}
                  </div>
                  <div>
                    <h3
                      className="font-bold text-lg"
                      style={{ color: "#002045" }}
                    >
                      {item.title}
                    </h3>
                    <p style={{ color: "#43474e" }}>{item.content}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Contact Form */}
            <div>
              <div
                className="rounded-2xl p-8"
                style={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #c4c6cf",
                }}
              >
                {submitted ? (
                  <div
                    className="rounded-xl p-6 text-center"
                    style={{
                      backgroundColor: "#f0f3ff",
                      border: "2px solid #b52426",
                    }}
                  >
                    <div className="text-5xl mb-4" style={{ color: "#b52426" }}>
                      ✓
                    </div>
                    <h3
                      className="text-2xl font-bold mb-2"
                      style={{ color: "#002045" }}
                    >
                      Thank you!
                    </h3>
                    <p style={{ color: "#43474e" }}>
                      Your message has been sent successfully. We&apos;ll get
                      back to you soon.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                      <label
                        htmlFor="name"
                        className="block text-sm font-semibold mb-2"
                        style={{ color: "#121c2c" }}
                      >
                        Name
                      </label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="Your name"
                        required
                        className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition focus:ring-2"
                        style={{
                          borderColor: "#c4c6cf",
                          color: "#121c2c",
                        }}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="email"
                        className="block text-sm font-semibold mb-2"
                        style={{ color: "#121c2c" }}
                      >
                        Email
                      </label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="your@email.com"
                        required
                        className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition focus:ring-2"
                        style={{
                          borderColor: "#c4c6cf",
                          color: "#121c2c",
                        }}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="message"
                        className="block text-sm font-semibold mb-2"
                        style={{ color: "#121c2c" }}
                      >
                        Message
                      </label>
                      <textarea
                        id="message"
                        name="message"
                        value={formData.message}
                        onChange={handleChange}
                        placeholder="Your message..."
                        required
                        rows={6}
                        className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition focus:ring-2 resize-none"
                        style={{
                          borderColor: "#c4c6cf",
                          color: "#121c2c",
                        }}
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full rounded-xl px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                      style={{ backgroundColor: "#b52426" }}
                    >
                      Send Message
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section
        className="py-20"
        style={{
          backgroundColor: "#f9f9ff",
          borderTop: "1px solid #c4c6cf",
        }}
      >
        <div className="mx-auto max-w-[1280px] px-8">
          <h2
            className="mb-12 text-4xl font-bold text-center"
            style={{ color: "#002045" }}
          >
            Frequently Asked Questions
          </h2>
          <div className="space-y-4 max-w-2xl mx-auto">
            {[
              {
                question: "How do I list photos on Homes.ph Drive?",
                answer:
                  "As a photographer, you can apply to become a contributor. Contact us for details about our contributor program.",
              },
              {
                question: "What payment methods do you accept?",
                answer:
                  "We accept credit cards, bank transfers, and digital wallets. All payments are processed securely.",
              },
              {
                question: "How long does delivery take?",
                answer:
                  "Photos are available for download immediately after purchase. High-resolution files are sent within 24 hours.",
              },
              {
                question: "Can I use commercial licenses?",
                answer:
                  "Yes, we offer both standard and commercial licenses for our photos.",
              },
            ].map((item, index) => (
              <div
                key={index}
                className="rounded-xl p-6"
                style={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #c4c6cf",
                }}
              >
                <h3
                  className="font-bold text-lg mb-2"
                  style={{ color: "#002045" }}
                >
                  {item.question}
                </h3>
                <p style={{ color: "#43474e" }}>{item.answer}</p>
              </div>
            ))}
          </div>
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
