/* eslint-disable @typescript-eslint/no-explicit-any */
import {format, formatRFC3339} from 'date-fns'

export type CalendarListEntry = {
  id: string;
  description: string;
  summary: string;
  timeZone: string;
  attendees?: AttendeeEntry[];
  start?: { dateTime: string; timeZone: string; date?: string; dateStr?: string; timeStr?: string };
  end?: { dateTime: string; timeZone: string; date?: string; dateStr?: string; timeStr?: string };
  conferenceData?: any;
  link?: any;
  htmlLink?: any;
};

export type AttendeeEntry = {
  name?: string;
  email: string;
  responseStatus: string;
};

export type CalendarEventListResponse = {
  items: CalendarListEntry[];
};

function getParams(minTime: Date, maxTime: Date) {
  const params = new URLSearchParams();

  params.append("singleEvents", "true");
  params.append("orderBy", "startTime");
  params.append("timeMin", formatRFC3339(minTime));
  params.append("timeMax", formatRFC3339(maxTime));
  params.append("timeZone", format(minTime, "xxx")); // this is needed to filter events in API correctly by local TZ
  
  return params.toString();
}

export function getCalendarListURL() {
    return `https://www.googleapis.com/calendar/v3/users/me/calendarList`;
  }

export function getCalendarEventListURL(calendarId: string, minTime: Date, maxTime: Date) {
    return `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${getParams(minTime, maxTime)}`;
  }
  