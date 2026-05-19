import type { ReactNode } from 'react'

interface PlaceholderPageProps {
  title: string
  description?: string
  children?: ReactNode
}

function PlaceholderPage({ title, description, children }: PlaceholderPageProps) {
  return (
    <div className="min-h-[60vh] p-4">
      <div className="space-y-3">
        <h1 className="text-4xl font-semibold">{title}</h1>
        {description && <p className="text-base-content/70">{description}</p>}
      </div>
      {children}
    </div>
  )
}

export default PlaceholderPage
