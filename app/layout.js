const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://goodsleep-rosy.vercel.app";
const TITLE = "우리의 하루";
const DESCRIPTION = "둘만의 수면·컨디션을 함께 기록하는 커플 웰니스 앱";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: TITLE,
  manifest: "/manifest.json",
  // 둘만 쓰는 개인 기록 앱이라 검색 결과에는 노출하지 않는다 (링크 미리보기용 OG 태그는 유지)
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "/",
    siteName: TITLE,
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: TITLE }],
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/icon-512.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: TITLE,
  },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/icon-512.png", sizes: "512x512", type: "image/png" }],
    apple: "/icon-192.png",
  },
  formatDetection: { telephone: false },
};

// maximumScale 제한을 없애 손가락 확대(접근성)를 허용한다. 입력칸 글자를 16px 로 맞춰 iOS 자동 확대는 생기지 않는다.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FF7043",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jua&family=Gowun+Dodum&display=swap" />
      </head>
      <body style={{ margin: 0, background: "#FFF6EF" }}>{children}</body>
    </html>
  );
}
