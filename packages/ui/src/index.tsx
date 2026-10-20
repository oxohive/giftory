/**
 * @gift/ui — shared UI for the dealer portal and (selectively) the storefront.
 *
 * Convention (frozen in tasks/phase-2-ui/CONTRACT-HANDOFF.md): named function exports only,
 * no default exports, every new component added here (or in a file re-exported from here) so
 * this file stays the one place to audit the package's surface area.
 */
export { cn } from './cn'

// Money / rates — see money.ts for the paise-vs-major-units warning.
export { formatBps, formatMoney, toMajorUnits, toMinorUnits } from './money'

// Dates — UTC-in, Asia/Kolkata-out.
export { formatDate, formatDateTime } from './datetime'

// Status.
export { statusLabel, statusTone, type StatusTone } from './status-tone'
export { StatusBadge } from './status-badge'

// Loading / empty / error / permission / session states.
export { EmptyState, ErrorNotice, LoadingState, PermissionDenied, SessionExpired } from './feedback'

// Tables.
export { pageCount } from './pagination-math'
export { Pagination } from './pagination'
export { Table, TableBody, TableCell, TableContainer, TableHead, TableHeaderCell, TableRow, TableStateRow } from './table'

// Forms.
export { Button, buttonVariants, type ButtonProps } from './button'
export { Checkbox, Field, fieldDescribedBy, Input, Label, Select, Textarea } from './form'

// Dialogs.
export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './dialog'
