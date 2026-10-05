import { Children, cloneElement, isValidElement, useId, type ReactElement } from 'react'
export function SettingsPanel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-subtle">
      <header className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>}
      </header>
      <div className="divide-y divide-border">{children}</div>
    </section>
  )
}

export function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  const labelId = useId()
  const controls = Children.map(children, (child) => isValidElement(child) && (typeof child.type !== 'string' || ['input', 'select', 'textarea'].includes(child.type)) ? cloneElement(child as ReactElement<{ 'aria-labelledby'?: string }>, { 'aria-labelledby': labelId }) : child)
  return (
    <div className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_260px] sm:items-center">
      <div>
        <p id={labelId} className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0" role="group" aria-labelledby={labelId}>{controls}</div>
    </div>
  )
}
