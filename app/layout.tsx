export const metadata = {
  title: "Rollup Mechanics Lab",
  description: "L2 rollup mechanics: optimistic and ZK pipelines",
};

import "./globals.css";

const themeBootScript = `(function(){try{var t=localStorage.getItem('eth-l2-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);return;}if(window.matchMedia('(prefers-color-scheme: light)').matches){document.documentElement.setAttribute('data-theme','light');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="antialiased min-h-screen" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
