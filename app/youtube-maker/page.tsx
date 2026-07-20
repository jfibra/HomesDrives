import ReelsMakerClient from '@/app/reels-maker/reels-maker-client'

export const metadata = {
  title: 'YouTube Listing Videos | Homes Albums Studio',
  description: 'Create landscape listing videos with the Homes.ph YouTube outro for API partners.',
}

export default function YoutubeMakerPage() {
  return <ReelsMakerClient mode="youtube" />
}
