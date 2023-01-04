import { parseISO, parse, format } from "date-fns";

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function isValidDate(date: Date) {
  return date instanceof Date && !isNaN(date.getTime());
}

export function getDateAsTanaString(date: Date) {
  return format(date, "MMMM do, yyyy");
}

export function getTimeAs24Hr(date: Date) {
  return format(date, "HH:mm");
}

export function getDateFromTanaString(date: string | undefined): Date {
  return date?parse(date, "MMMM do, yyyy", new Date()): new Date();
}

export function getDateFromISOString(date: string | undefined): Date {
  return date?parseISO(date): new Date();
}

export const nth = function (d: number) {
  if (d > 3 && d < 21) return "th";
  switch (d % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
};

export const formatDate = (dateString: string) => {
  const d = new Date(dateString);
  const year = d.getFullYear();
  const date = d.getDate();
  const month = months[d.getMonth()];
  const nthStr = nth(date);
  return `${month} ${date}${nthStr}, ${year}`;
};
