export default function ReaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* ar5iv.css scoped to .paper-html — loaded only on reader pages */}
      <link rel="stylesheet" href="/ar5iv.css" precedence="low" />
      {children}
    </>
  );
}
