import { LoadingState } from '@gift/ui'

export default function Loading() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center">
      <LoadingState label="Loading your workspace…" />
    </main>
  )
}
