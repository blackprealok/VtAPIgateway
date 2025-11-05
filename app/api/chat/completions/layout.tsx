import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Vercel Vertex AI Gateway',
  description: 'OpenAI-compatible Gemini proxy gateway powered by Vertex AI'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}