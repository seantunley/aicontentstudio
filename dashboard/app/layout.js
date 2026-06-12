import './globals.css';

export const metadata = {
  title: 'The Studio — Operator’s Desk',
  description: 'AI Content Studio — operator console',
};
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f0d0a' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,550;0,9..144,650;1,9..144,450;1,9..144,600&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
