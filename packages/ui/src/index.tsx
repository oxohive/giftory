import type { ReactNode } from 'react'
export { formatMoney, toMinorUnits, toMajorUnits } from './money'
export function StatusBadge({ value }: {value: string}) { return <span className={'badge badge-' + value}>{value.replaceAll('_', ' ')}</span> }
export function EmptyState({title, children}: {title: string; children?: ReactNode}) { return <div className="empty"><h3>{title}</h3><p>{children}</p></div> }
export function ErrorNotice({message}: {message: string}) { return <div className="notice error" role="alert">{message}</div> }
export function formatDate(value?: string | null) { return value ? new Intl.DateTimeFormat('en-IN', {dateStyle:'medium',timeZone:'Asia/Kolkata'}).format(new Date(value)) : 'Not provided' }
