import {
  Action,
  ActionPanel,
  Form,
  Icon,
  List,
  LocalStorage,
  showToast,
  Toast,
  useNavigation,
  Clipboard,
  closeMainWindow,
} from "@raycast/api";
import { useFetch } from "@raycast/utils";
import { endOfDay, startOfDay } from "date-fns";
import fetch from "node-fetch";
import { useEffect, useState } from "react";
import Mustache from "mustache";
import {
  CalendarListEntry,
  getCalendarListURL,
  getCalendarEventListURL,
  CalendarEventListResponse,
} from "./api/readCalendar";
import { withGoogleAuth, getOAuthToken } from "./components/withGoogleAuth";
import { ContactsSearchResponse, getContactSearchByEmailURL } from "./api/readContact";
import { revokeTokens } from "./api/oauth";
import { getDateAsTanaString, getDateFromISOString, getTimeAs24Hr } from "./helpers/date";

const CALS_KEY = "TanaGCalHelper.selectedCals";
const MEETING_TAG_KEY = "TanaGCalHelper.meetingTag";

function UsersGooleCalendars() {
  const { pop } = useNavigation();
  const { data: allUserCals } = useFetch<{ items: CalendarListEntry[] }>(getCalendarListURL(), {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOAuthToken()}`,
    },
    // onData(data) {
    //   console.log(data.items.length);
    // },
    onError(error) {
      console.dir(error);
      console.error(error);
      showToast({ style: Toast.Style.Failure, title: "Failed to retrieve Google calendars" });
    },
  });

  const [cals, setCals] = useState<string[] | undefined>([]);
  useEffect(() => {
    LocalStorage.getItem<string>(CALS_KEY).then((item) => {
      setCals(item?.split(","));
    });
  }, [allUserCals]);

  async function saveCals(cals: string[]): Promise<void> {
    await LocalStorage.setItem(CALS_KEY, cals.join(","));
    setCals(cals);
  }

  const [meetingTag, setMeetingTag] = useState<string | undefined>("#calendar-event");
  useEffect(() => {
    LocalStorage.getItem<string>(MEETING_TAG_KEY).then((item) => {
      setMeetingTag(item);
    });
  }, [allUserCals]);

  async function saveMeetingTag(tag: string): Promise<void> {
    await LocalStorage.setItem(MEETING_TAG_KEY, tag);
    setMeetingTag(tag);
  }

  const [allEvents, setAllEvents] = useState<CalendarListEntry[]>([]);
  useEffect(() => {
    if (cals && cals.length) {
      Promise.all(
        cals.map((cal) => {
          return fetch(getCalendarEventListURL(cal, startOfDay(new Date()), endOfDay(new Date())), {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${getOAuthToken()}`,
            },
          });
        })
      ).then((values) => {
        Promise.all(values.map((reponse) => reponse.json())).then((allData) => {
          setAllEvents(
            allData
              .map((oneData) => {
                return (oneData as CalendarEventListResponse).items;
              })
              .flat(1)
              .filter(function (element) {
                return element !== undefined;
              })
              .filter((value, index, self) => index === self.findIndex((t) => t?.id === value?.id)) // renove the same event that might be in more than one cal
              .map((evt) => {
                setEventDateAndTime(evt);
                if ( evt.attendees ) Promise.all(
                  evt.attendees.map((attendee) =>
                    fetch(getContactSearchByEmailURL(attendee.email), {
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${getOAuthToken()}`,
                      },
                    })
                  )
                ).then((values) => {
                  Promise.all(values.map((reponse) => reponse.json())).then((allData) => {
                    const eventAttendees = allData
                      .map((oneData) => {
                        return (oneData as ContactsSearchResponse).results;
                      })
                      .flat(1)
                      .filter(function (element) {
                        return element !== undefined;
                      });

                    evt.attendees?.forEach((attendee) => {
                      const person = eventAttendees.find((eventAttendee) => {
                        return eventAttendee.person.emailAddresses.find((emailAddress) => {
                          return emailAddress.value === attendee.email;
                        });
                      });
                      if (person) {
                        attendee.name = person.person.names[0].displayName;
                      }
                    });
                  });
                });
                return evt;
              })
              .sort((a, b) => {
                if (a.start && b.start) {
                  return (
                    getDateFromISOString(a.start.dateTime || a.start.date).getTime() -
                    getDateFromISOString(b.start.dateTime || b.start.date).getTime()
                  );
                }
                return 0;
              })
          );
          
        });
      });
    }
  }, [cals]);

  function setEventDateAndTime(event: CalendarListEntry) {
    if (event.start) {
      event.start.dateStr = getDateAsTanaString(getDateFromISOString(event.start.dateTime || event.start.date));
      event.start.timeStr = getTimeAs24Hr(getDateFromISOString(event.start.dateTime || event.start.date));
    }
    if (event.end) {
      event.end.dateStr = getDateAsTanaString(getDateFromISOString(event.end.dateTime || event.end.date));
      event.end.timeStr = getTimeAs24Hr(getDateFromISOString(event.end.dateTime || event.end.date));
    }

    if (event.conferenceData && event.conferenceData.entryPoints && event.conferenceData.entryPoints.length > 0) {
      event.link = event.conferenceData.entryPoints[0].uri;
    }

    if (event.description) {
      // process descriptions that have embedded Zoom links in them
      const zoomUrlRegex = /https:\/\/([a-zA-Z0-9]+\.)?zoom\.us\/j\/\d+(\?[^\s]+)?/;
      const zoomUrl = event.description.match(zoomUrlRegex);
      
      // Tana paste can handle single newlines
      event.description = event.description
        .replace(/\n+/g, "\n")
        .replace(/\n_+\n/g, "\n")
        .trim();

      if (zoomUrl && !event.link) {
        event.link = zoomUrl[0];
      }
    }
  }

  function generateSingleEventTemplate(event: CalendarListEntry): string {
    const result = Mustache.render(
      `- {{summary}} ${meetingTag} {{#attendees.length}}#meeting{{/attendees.length}}
  - summary:: {{{summary}}}
  - description:: {{{description}}}
  - start_time:: {{{start.timeStr}}}
  - end_time:: {{{end.timeStr}}}
  - date:: [[{{start.dateStr}}]]
{{#link}}
  - link:: [zoom]({{{link}}})
{{/link}}
{{#location}}
  - location:: {{{location}}}
{{/location}}
{{#htmlLink}}
  - original_event:: [google]({{{htmlLink}}})
{{/htmlLink}}
{{#attendees.length}}
  - attendees::
{{/attendees.length}}
{{#attendees}}
    - [[{{{name}}} #person]]
{{/attendees}}
`,
      event
    );
    return result;
  }

  function generateEventTemplate(event: CalendarListEntry) {
    const result = `%%tana%%
${generateSingleEventTemplate(event)}
`;
    Clipboard.copy(result);
  }

  function generateEventsTemplate(events: CalendarListEntry[]) {
    const result = `%%tana%%
${events.map((event) => generateSingleEventTemplate(event)).join("\n")}
`;
    Clipboard.copy(result);
  }

  async function actOnEvent(event: CalendarListEntry) {
    generateEventTemplate(event);
    await closeMainWindow();
  }
  
  async function actOnAllEvent(events: CalendarListEntry[]) {
    generateEventsTemplate(events);
    await closeMainWindow();
  }
  
  function getSetCalsAction() {
    return (
      <Action.Push
        title="Set Selected Calendars"
        target={
          <Form
            actions={
              <ActionPanel>
                <Action.SubmitForm
                  title="Select Calendars"
                  onSubmit={(values) => {
                    saveCals(values.cals);
                    pop();
                  }}
                />
              </ActionPanel>
            }
          >
            {allUserCals?.items && allUserCals.items.length > 0 ? (
              <Form.TagPicker id="cals" title="Select Calendars" defaultValue={cals}>
                {allUserCals.items?.map((entry: CalendarListEntry) => (
                  <Form.TagPicker.Item
                    title={entry.summary}
                    key={entry.id}
                    value={entry.id}
                    icon={cals?.includes(entry.id) ? Icon.CheckCircle : Icon.Circle}
                  />
                ))}
              </Form.TagPicker>
            ) : null}
          </Form>
        }
      />
    );
  }

  function getMeetingTagAction() {
    return (
      <Action.Push
        title="Set Meeting Tag"
        target={
          <Form
            actions={
              <ActionPanel>
                <Action.SubmitForm
                  title="Select Calendars"
                  onSubmit={(values) => {
                    saveMeetingTag(values.tagField);
                    pop();
                  }}
                />
              </ActionPanel>
            }
          >
            <Form.TextField
              id="tagField"
              title="Meeting Tag"
              placeholder="Enter your meeting tag including #"
              key="tagField"
            />
          </Form>
        }
      />
    );
  }
  return (
    <List isLoading={allEvents?.length > 0} searchBarPlaceholder="Filter by event name">
      <List.EmptyView
        title="No events"
        description="You haven't selected any calendars yet"
        actions={<ActionPanel>{getMeetingTagAction()}</ActionPanel>}
      />

      {allEvents && allEvents.length > 0 ? (
        <List.Section
          title="Recent Events"
          subtitle={`${allEvents.length} start: ${startOfDay(new Date()).toISOString()} end: ${endOfDay(
            new Date()
          ).toISOString()}`}
        >
          {allEvents?.map((entry: CalendarListEntry) => {
            return (
              <List.Item
                title={entry ? `${entry.start?.timeStr} - ${entry.end?.timeStr} : ${entry.summary}` : ""}
                key={entry?.id}
                icon="📅"
                actions={
                  <ActionPanel title={entry ? entry.summary : ""}>
                    <ActionPanel.Section>
                      <Action
                        title="Generate Event for Tana"
                        icon={Icon.Star}
                        shortcut={{ modifiers: ["cmd", "shift"], key: "f" }}
                        onAction={() => {
                          actOnEvent(entry);
                        }}
                      />
                      <Action
                        title="Generate All Event for Tana"
                        icon={Icon.Star}
                        shortcut={{ modifiers: ["cmd", "shift"], key: "a" }}
                        onAction={() => {
                          actOnAllEvent(allEvents);
                        }}
                      />
                      <Action
                        title="Logout"
                        onAction={() => {
                          revokeTokens(getOAuthToken());
                        }}
                      />
                    </ActionPanel.Section>
                    {getSetCalsAction()}
                    {getMeetingTagAction()}
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      ) : null}
    </List>
  );
}

export default function Command() {
  return withGoogleAuth(<UsersGooleCalendars />);
}
