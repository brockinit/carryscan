import { NextResponse } from "next/server";
import { readWeeklyReport } from "@/lib/weekly";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ week: string }> },
) {
  const report = readWeeklyReport((await params).week);
  if (!report) {
    return NextResponse.json({ error: "report not found" }, { status: 404 });
  }
  return NextResponse.json(report);
}
