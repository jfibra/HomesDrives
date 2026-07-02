import type { Metadata } from 'next'

import TestingClient from './testing-client'

export const metadata: Metadata = {
  title: 'Building Recognition Testing | Homes Drive',
  description: 'Internal testing page for building registration and visual recognition.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function TestingPage() {
  return <TestingClient />
}
