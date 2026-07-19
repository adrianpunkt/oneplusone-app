const MAX_CALENDAR_SIZE = 64 * 1024;

function isCalendarFile(value: string) {
  const contents = value.trim();

  return (
    contents.length <= MAX_CALENDAR_SIZE &&
    contents.startsWith("BEGIN:VCALENDAR") &&
    contents.includes("BEGIN:VEVENT") &&
    contents.endsWith("END:VCALENDAR")
  );
}

function safeFileName(value: FormDataEntryValue | null) {
  const baseName = typeof value === "string" ? value.replace(/\.ics$/i, "") : "event";
  const safeBaseName = baseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80);

  return `${safeBaseName || "event"}.ics`;
}

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  const contents = formData?.get("contents");

  if (typeof contents !== "string" || !isCalendarFile(contents)) {
    return new Response("Invalid calendar event.", { status: 400 });
  }

  return new Response(contents, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${safeFileName(formData?.get("name") ?? null)}"`,
      "Content-Type": "text/calendar; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
