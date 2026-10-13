 'use client'
export default function ErrorPage({reset}: {reset:()=>void}) { return <main id="main" className="page"><h1>We couldn?t load this page</h1><p>Your changes may not have been saved. Please retry.</p><button onClick={reset}>Try again</button></main> }
