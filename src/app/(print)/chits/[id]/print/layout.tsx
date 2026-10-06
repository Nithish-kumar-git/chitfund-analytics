/**
 * Print statement layout.
 *
 * Overrides the parent (app) layout so the print page renders without
 * the app sidebar, mobile topbar, and main content padding.
 * The statement is self-contained and manages its own chrome.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}