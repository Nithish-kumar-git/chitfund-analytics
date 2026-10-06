export default function PrintRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="print:bg-white print:text-black">
      {children}
    </div>
  )
}
