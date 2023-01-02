

export type ContactEntry = {
  person: PersonEntry;
};

export type PersonEntry = {
  resourceName: string;
  etag: string;
  names: NameEntry[];
  emailAddresses: EmailEntry[];
};

export type NameEntry = {
  displayName: string;
  familyName: string;
  givenName: string;
  middleName: string;
  displayNameLastFirst: string;
  unstructuredName: string;
};

export type EmailEntry = {
  value: string;
  type: string;
  formattedType: string;
};

export type ContactsSearchResponse = {
  results: ContactEntry[];
};

function getParams(emailAddress: string) {
  const params = new URLSearchParams();

  params.append("pageSize", "1");
  params.append("readMask", "names,emailAddresses");
  params.append("query", emailAddress);
  return params.toString();
}

export function getContactSearchByEmailURL(emailAdress: string) {
  return `https://people.googleapis.com/v1/people:searchContacts?${getParams(emailAdress)}`;
}
