import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ sarvamConfigured: Boolean(process.env.SARVAM_API_KEY) });
}
