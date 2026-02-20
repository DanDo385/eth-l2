export const metadata = {
  title: "Rollup Mechanics Lab",
  description: "L2 rollup mechanics: optimistic and ZK pipelines",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
