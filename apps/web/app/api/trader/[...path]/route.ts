import { NextResponse } from "next/server";
import { traderFetch } from "@/lib/trader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function proxy(req: Request, path: string[]) {
  const url = new URL(req.url);
  const suffix = `/${path.join("/")}${url.search}`;
  try {
    const r = await traderFetch(suffix, {
      method: req.method,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.text(),
    });
    const text = await r.text();
    return new NextResponse(text, {
      status: r.status,
      headers: { "content-type": r.headers.get("content-type") || "application/json" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "trader_ai unreachable", detail: String(e), offline: true },
      { status: 503 },
    );
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
