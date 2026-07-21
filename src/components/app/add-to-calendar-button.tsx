"use client";

import { CalendarPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HoverTooltip } from "@/components/ui/hover-tooltip";

type CalendarEvent = {
  description?: string | null;
  endsAt?: string | null;
  id?: string | null;
  location?: string | null;
  startsAt?: string | null;
  title: string;
};

export type CalendarCopy = {
  add: string;
  defaultDescription: string;
};

function parseEventDates(startsAt: string | null | undefined, endsAt: string | null | undefined) {
  if (!startsAt) return null;

  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return null;

  const explicitEnd = endsAt ? new Date(endsAt) : null;
  const end =
    explicitEnd && !Number.isNaN(explicitEnd.getTime()) && explicitEnd > start
      ? explicitEnd
      : new Date(start.getTime() + 2 * 60 * 60 * 1000);

  return { end, start };
}

function calendarDate(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function calendarUid(event: CalendarEvent, start: Date) {
  return `${event.id || event.title}-${calendarDate(start)}@oneplusoneclub`;
}

function escapeIcsValue(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function eventDescription(event: CalendarEvent, copy: CalendarCopy) {
  return event.description || copy.defaultDescription;
}

function calendarFileName(event: CalendarEvent) {
  return `${event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "event"}.ics`;
}

function createCalendarFile(event: CalendarEvent, copy: CalendarCopy) {
  const dates = parseEventDates(event.startsAt, event.endsAt);
  if (!dates) return null;

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//oneplusoneclub//Going Out//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsValue(calendarUid(event, dates.start))}`,
    `DTSTAMP:${calendarDate(new Date())}`,
    `DTSTART:${calendarDate(dates.start)}`,
    `DTEND:${calendarDate(dates.end)}`,
    `SUMMARY:${escapeIcsValue(event.title)}`,
    `DESCRIPTION:${escapeIcsValue(eventDescription(event, copy))}`,
    event.location ? `LOCATION:${escapeIcsValue(event.location)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  return { contents: ics, name: calendarFileName(event) };
}

function openAppleCalendarEvent(event: CalendarEvent, copy: CalendarCopy) {
  const file = createCalendarFile(event, copy);
  if (!file) return;

  const form = document.createElement("form");
  form.action = "/api/calendar/event.ics";
  form.method = "POST";
  form.target = "_blank";
  form.hidden = true;

  for (const [name, value] of Object.entries(file)) {
    const input = document.createElement("input");
    input.name = name;
    input.type = "hidden";
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
  form.remove();
}

function openGoogleCalendarEvent(event: CalendarEvent, copy: CalendarCopy) {
  const dates = parseEventDates(event.startsAt, event.endsAt);
  if (!dates) return;

  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", event.title);
  url.searchParams.set("dates", `${calendarDate(dates.start)}/${calendarDate(dates.end)}`);
  url.searchParams.set("details", eventDescription(event, copy));
  if (event.location) url.searchParams.set("location", event.location);

  window.open(url.toString(), "_blank", "noopener,noreferrer");
}

function preferredCalendar() {
  const platform = navigator.platform || "";
  const userAgent = navigator.userAgent || "";
  const isIPad = platform === "MacIntel" && navigator.maxTouchPoints > 1;
  const isApple = isIPad || /Mac|iPhone|iPad|iPod/i.test(`${platform} ${userAgent}`);

  return isApple ? "apple" : "google";
}

export function AddToCalendarButton({
  copy,
  event,
  iconOnly = false,
}: {
  copy: CalendarCopy;
  event: CalendarEvent;
  iconOnly?: boolean;
}) {
  const hasDate = Boolean(event.startsAt);

  function addToCalendar() {
    if (preferredCalendar() === "apple") {
      openAppleCalendarEvent(event, copy);
      return;
    }

    openGoogleCalendarEvent(event, copy);
  }

  return (
    <Button
      aria-label={iconOnly ? copy.add : undefined}
      className={
        iconOnly
          ? "group relative h-7 w-7 gap-0 px-0 text-[11px]"
          : "h-7 gap-1.5 px-2.5 text-[11px]"
      }
      disabled={!hasDate}
      onClick={addToCalendar}
      size="sm"
      type="button"
      variant="secondary"
    >
      <CalendarPlus aria-hidden="true" className="h-3.5 w-3.5" />
      {iconOnly ? <HoverTooltip>{copy.add}</HoverTooltip> : copy.add}
    </Button>
  );
}
