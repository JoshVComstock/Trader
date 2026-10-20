import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: 180, height: 180, display: "flex", alignItems: "center", justifyContent: "center", background: "#14151c" }}>
        <svg width="112" height="112" viewBox="0 0 24 24">
          <path d="M3 17 L9 11 L13 15 L21 6" stroke="#8b8cf6" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15 6 L21 6 L21 12" stroke="#8b8cf6" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    size,
  );
}
