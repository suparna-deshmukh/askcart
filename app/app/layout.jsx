import "./globals.css";

export const metadata = {
  title: "AskCart - Guided Shopping Search",
  description: "Ask in plain language. AskCart guides you to the product.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
