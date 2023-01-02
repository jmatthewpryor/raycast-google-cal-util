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
} from "@raycast/api";
import { useFetch } from "@raycast/utils";
import { endOfDay, startOfDay } from "date-fns";
import fetch from "node-fetch";
import { useEffect, useState } from "react";
import Mustache from "mustache";
import {
  CalendarListEntry,
  CalendarEventEntry,
  getCalendarListURL,
  getCalendarEventListURL,
  CalendarEventListResponse,
} from "./api/readCalendar";
import { withGoogleAuth, getOAuthToken } from "./components/withGoogleAuth";
import { ContactsSearchResponse, getContactSearchByEmailURL } from "./api/readContact";
import { revokeTokens } from "./api/oauth";
import { formatDate } from "./helpers/date";

const CALS_KEY = "TanaGCalHelper.selectedCals";

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

  const [allEvents, setAllEvents] = useState<CalendarEventEntry[]>([]);
  useEffect(() => {
    if (cals && cals.length)
      Promise.all(
        cals.map((cal) =>
          fetch(getCalendarEventListURL(cal, startOfDay(new Date()), endOfDay(new Date())), {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${getOAuthToken()}`,
            },
          })
        )
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
          );
        });
      });
  }, [cals]);

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
  function actOnEvent(event: CalendarListEntry) {
    if (event.start) event.start.date = formatDate(event.start.dateTime);
    if (event.end) event.end.date = formatDate(event.end.dateTime);
    if (event.attendees)
      Promise.all(
        event.attendees.map((attendee) =>
          fetch(getContactSearchByEmailURL(attendee.email), {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${getOAuthToken()}`,
            },
          })
        )
      ).then((values) => {
        Promise.all(values.map((reponse) => reponse.json())).then((allData) => {
          console.log("allData");
          console.log(JSON.stringify(allData));

          const eventAttendees = allData
            .map((oneData) => {
              return (oneData as ContactsSearchResponse).results;
            })
            .flat(1)
            .filter(function (element) {
              return element !== undefined;
            });

          console.log("eventAttendees");
          console.log(JSON.stringify(eventAttendees));

          event.attendees?.forEach((attendee) => {
            const person = eventAttendees.find((eventAttendee) => {
              return eventAttendee.person.emailAddresses.find((emailAddress) => {
                return emailAddress.value === attendee.email;
              });
            });
            if (person) {
              attendee.name = person.person.names[0].displayName;
            }
          });
          console.dir(JSON.stringify(event));
          const result = Mustache.render(
            `%%tana%%
- {{summary}} #calendar-event
  - summary:: {{summary}}
  - id:: {{id}}
  - date:: [[{{start.date}}]]
  - attendees::
{{#attendees}}
    - {{name}} #person
{{/attendees}}
`,
            event
          );
          Clipboard.copy(result);
          console.log(result);
        });
      });
  }

  return (
    <List isLoading={allEvents?.length > 0} searchBarPlaceholder="Filter by event name">
      <List.EmptyView
        title="No events"
        description="You haven't selected any calendars yet"
        actions={
          <ActionPanel>
            {getSetCalsAction()}
          </ActionPanel>
        }
      />

      {allEvents && allEvents.length > 0 ? (
        <List.Section title="Recent Events" subtitle={`${allEvents.length}`}>
          {allEvents?.map((entry: CalendarListEntry) => (
            <List.Item
              title={entry ? entry.summary : ""}
              key={entry?.id}
              icon="☑️"
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
                      title="Logout"
                      onAction={() => {
                        revokeTokens(getOAuthToken());
                      }}
                    />
                  </ActionPanel.Section>
                  {getSetCalsAction()}
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ) : null}
    </List>
  );
}

export default function Command() {
  return withGoogleAuth(<UsersGooleCalendars />);
}
