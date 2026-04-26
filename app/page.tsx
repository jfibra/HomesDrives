import { Button } from '@/components/ui/button'
import { ArrowRight, Home, Heart, MapPin } from 'lucide-react'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-b from-background to-background/95">
      {/* Header */}
      <header className="border-b border-border/40">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex items-center gap-2">
            <Home className="h-6 w-6 sm:h-8 sm:w-8" />
            <h1 className="text-2xl sm:text-3xl font-bold">For Homes</h1>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-12 sm:py-20">
        <div className="max-w-3xl text-center space-y-6 sm:space-y-8">
          <div className="space-y-3 sm:space-y-4">
            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
              Your Home, Your Way
            </h2>
            <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Discover the perfect place to call home. Explore properties, connect with communities, and find your ideal living space.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center pt-4">
            <Button size="lg" className="w-full sm:w-auto">
              Explore Properties
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              Learn More
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="px-4 py-12 sm:py-16 border-t border-border/40">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-3">
              <Heart className="h-8 w-8 text-primary" />
              <h3 className="text-lg font-semibold">Curated Listings</h3>
              <p className="text-sm text-muted-foreground">
                Hand-picked properties that match your lifestyle and preferences.
              </p>
            </div>

            <div className="space-y-3">
              <MapPin className="h-8 w-8 text-primary" />
              <h3 className="text-lg font-semibold">Smart Location</h3>
              <p className="text-sm text-muted-foreground">
                Find homes in neighborhoods that fit your needs perfectly.
              </p>
            </div>

            <div className="space-y-3">
              <Home className="h-8 w-8 text-primary" />
              <h3 className="text-lg font-semibold">Easy Browsing</h3>
              <p className="text-sm text-muted-foreground">
                Intuitive interface to discover your next home effortlessly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-border/40 py-6 sm:py-8 px-4">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © 2024 For Homes. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm">
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
              Privacy
            </a>
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
              Terms
            </a>
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </main>
  )
}
