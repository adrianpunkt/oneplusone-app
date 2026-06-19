"use client";

import { useState } from "react";
import { CalendarPlus } from "lucide-react";

import { Button } from "@/components/ui/button";

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
  apple: string;
  defaultDescription: string;
  google: string;
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

function downloadAppleCalendarEvent(event: CalendarEvent, copy: CalendarCopy) {
  const dates = parseEventDates(event.startsAt, event.endsAt);
  if (!dates) return;

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

  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "event"}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
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

export function AddToCalendarButton({
  copy,
  event,
}: {
  copy: CalendarCopy;
  event: CalendarEvent;
}) {
  const [open, setOpen] = useState(false);
  const hasDate = Boolean(event.startsAt);

  function addToAppleCalendar() {
    downloadAppleCalendarEvent(event, copy);
    setOpen(false);
  }

  function addToGoogleCalendar() {
    openGoogleCalendarEvent(event, copy);
    setOpen(false);
  }

  return (
    <div className="relative inline-flex">
      <Button
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={!hasDate}
        onClick={() => setOpen((current) => !current)}
        size="sm"
        type="button"
        variant="secondary"
      >
        <CalendarPlus className="h-4 w-4" />
        {copy.add}
      </Button>
      {open ? (
        <div
          className="absolute right-0 top-full z-20 mt-2 grid min-w-44 gap-1 rounded-lg border border-wine-burgundy/10 bg-white p-1.5 shadow-[0_18px_45px_rgba(68,10,18,0.12)]"
          role="menu"
        >
          <button
            className="rounded-md px-3 py-2 text-left text-sm font-semibold text-wine-burgundy hover:bg-blush-pink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-blue/35"
            onClick={addToAppleCalendar}
            role="menuitem"
            type="button"
          >
            {copy.apple}
          </button>
          <button
            className="rounded-md px-3 py-2 text-left text-sm font-semibold text-wine-burgundy hover:bg-blush-pink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-blue/35"
            onClick={addToGoogleCalendar}
            role="menuitem"
            type="button"
          >
            {copy.google}
          </button>
        </div>
      ) : null}
    </div>
  );
}
