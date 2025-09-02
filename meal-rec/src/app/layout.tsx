import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ClientSessionProvider from "./ClientSessionProvider";
import Navigation from "@/components/Navigation";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://mealrec.app"),
  title: "Meal Recommendation PWA",
  description: "A Progressive Web App for personalized meal recommendations",
  manifest: "/manifest.json",
  openGraph: {
    title: "Meal Recommendation PWA",
    description: "A Progressive Web App for personalized meal recommendations",
    type: "website",
    url: "https://mealrec.app",
    images: [
      {
        url: "/og-default-meal.jpg",
        width: 1200,
        height: 630,
        alt: "MealRec - Personalized Meal Recommendations",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Meal Recommendation PWA",
    description: "A Progressive Web App for personalized meal recommendations",
    images: ["/og-default-meal.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ClientSessionProvider>
          <Navigation />
          {children}
        </ClientSessionProvider>
      </body>
    </html>
  );
}
