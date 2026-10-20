import { ImageResponse } from "next/og";

const SIZES: Record<string, { px: number; pad: number }> = {
  "192": { px: 192, pad: 0 },
  "512": { px: 512, pad: 0 },
  maskable: { px: 512, pad: 0.2 },
};

export function generateStaticParams() {
  return Object.keys(SIZES).map((size) => ({ size }));
}

export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const { size } = await ctx.params;
  const spec = SIZES[size] ?? SIZES["512"];
  return new ImageResponse(<Mark px={spec.px} pad={spec.pad} />, { width: spec.px, height: spec.px });
}

function Mark({ px, pad }: { px: number; pad: number }) {
  const inner = px * (1 - pad * 2);
  return (
    <div style={{ width: px, height: px, display: "flex", alignItems: "center", justifyContent: "center", background: "#14151c" }}>
      <svg width={inner * 0.62} height={inner * 0.62} viewBox="0 0 24 24">
        <path d="M3 17 L9 11 L13 15 L21 6" stroke="#8b8cf6" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 6 L21 6 L21 12" stroke="#8b8cf6" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
