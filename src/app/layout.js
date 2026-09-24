import "./globals.css";

export const metadata = {
  title: "Trao | AI Interview Prep Kit",
  description: "Research-driven interview preparation kits from job descriptions."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
