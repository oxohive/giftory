import type { Metadata } from 'next'
import './globals.css'
export const metadata: Metadata = { title: {default:'Gift Partner Studio',template:'%s | Gift Partner Studio'}, description:'Your workspace for thoughtful gifts, production and earnings.' }
export default function Layout({children}: {children:React.ReactNode}) {return <html lang="en"><body><a className="skip" href="#main">Skip to content</a>{children}</body></html>}
