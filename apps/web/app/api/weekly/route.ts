import { NextResponse } from "next/server";
import { latestWeeklyReport, listWeeklyReportDates } from "@/lib/weekly";

export const dynamic = "force-dynamic";

export async function GET() {
  const dates = listWeeklyReportDates();
  const latest = latestWeeklyReport();
  return NextResponse.json({
    dates,
    latest,
  });
}
