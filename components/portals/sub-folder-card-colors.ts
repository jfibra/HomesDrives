export const SUB_FOLDER_CARD_COLORS = [
  {
    card: 'border-sky-300 bg-sky-100 hover:border-sky-400 hover:bg-sky-200',
    title: 'text-sky-950',
    meta: 'text-sky-700',
    icon: 'text-sky-600',
  },
  {
    card: 'border-fuchsia-300 bg-fuchsia-100 hover:border-fuchsia-400 hover:bg-fuchsia-200',
    title: 'text-fuchsia-950',
    meta: 'text-fuchsia-700',
    icon: 'text-fuchsia-600',
  },
  {
    card: 'border-lime-300 bg-lime-100 hover:border-lime-400 hover:bg-lime-200',
    title: 'text-lime-950',
    meta: 'text-lime-700',
    icon: 'text-lime-600',
  },
  {
    card: 'border-amber-300 bg-amber-100 hover:border-amber-400 hover:bg-amber-200',
    title: 'text-amber-950',
    meta: 'text-amber-700',
    icon: 'text-amber-600',
  },
  {
    card: 'border-rose-300 bg-rose-100 hover:border-rose-400 hover:bg-rose-200',
    title: 'text-rose-950',
    meta: 'text-rose-700',
    icon: 'text-rose-600',
  },
  {
    card: 'border-teal-300 bg-teal-100 hover:border-teal-400 hover:bg-teal-200',
    title: 'text-teal-950',
    meta: 'text-teal-700',
    icon: 'text-teal-600',
  },
  {
    card: 'border-orange-300 bg-orange-100 hover:border-orange-400 hover:bg-orange-200',
    title: 'text-orange-950',
    meta: 'text-orange-700',
    icon: 'text-orange-600',
  },
  {
    card: 'border-violet-300 bg-violet-100 hover:border-violet-400 hover:bg-violet-200',
    title: 'text-violet-950',
    meta: 'text-violet-700',
    icon: 'text-violet-600',
  },
] as const

export function getSubFolderCardColorByIndex(index: number) {
  return SUB_FOLDER_CARD_COLORS[index % SUB_FOLDER_CARD_COLORS.length]
}
