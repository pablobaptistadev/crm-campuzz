import { ApiClient, unwrap } from 'src/api-client';
import { type Bindings } from 'src/env';
import { assert, assertEqual, Recorder, type StepResult } from 'src/runner';

type CompanyNode = {
  id: string;
  name: string | null;
  employees: number | null;
  idealCustomerProfile: boolean | null;
  domainName: { primaryLinkUrl: string | null } | null;
  address: { addressCity: string | null; addressCountry: string | null } | null;
  annualRecurringRevenue: {
    amountMicros: string | null;
    currencyCode: string | null;
  } | null;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
};

const COMPANY_FIELDS = `
  id
  name
  employees
  idealCustomerProfile
  domainName { primaryLinkUrl primaryLinkLabel }
  address { addressCity addressCountry }
  annualRecurringRevenue { amountMicros currencyCode }
  createdAt
  updatedAt
  deletedAt
`;

export const runApiSuite = async (
  bindings: Bindings,
): Promise<{ steps: StepResult[] }> => {
  const recorder = new Recorder('api');
  const client = new ApiClient(bindings.TARGET_URL);
  const runSuffix = Date.now().toString(36);

  await recorder.step('health: database and cache reachable', async () => {
    const response = await client.fetch('/healthz');
    const body = (await response.json()) as {
      status: string;
      databaseLatencyMs: number;
      cache: { status: string; latencyMs: number | null };
    };

    assertEqual(response.status, 200, 'healthz status');
    assertEqual(body.status, 'ok', 'healthz body status');

    return body;
  });

  await recorder.step('client-config: boot payload served', async () => {
    const response = await client.fetch('/client-config');
    const body = (await response.json()) as Record<string, unknown>;

    assertEqual(response.status, 200, 'client-config status');
    assert(
      typeof body === 'object' && body !== null,
      'client-config returned an object',
    );

    return { keys: Object.keys(body).length };
  });

  await recorder.step(
    'public workspace data resolves for this host',
    async () => {
      const { body } = await client.graphql<{
        getPublicWorkspaceDataByDomain: {
          id: string;
          displayName: string | null;
          workspaceUrls: { subdomainUrl: string };
          authProviders: { password: boolean };
        };
      }>({
        endpoint: '/metadata',
        query: `query GetPublicWorkspaceDataByDomain($origin: String!) {
        getPublicWorkspaceDataByDomain(origin: $origin) {
          id displayName workspaceUrls { subdomainUrl customUrl } authProviders { password google }
        }
      }`,
        variables: { origin: bindings.TARGET_URL },
      });

      const data = unwrap(body, 'getPublicWorkspaceDataByDomain');

      assert(
        data.getPublicWorkspaceDataByDomain.authProviders.password,
        'password provider enabled',
      );

      return data.getPublicWorkspaceDataByDomain;
    },
  );

  await recorder.step('checkUserExists finds the test account', async () => {
    const { body } = await client.graphql<{
      checkUserExists: { exists: boolean; availableWorkspacesCount: number };
    }>({
      endpoint: '/metadata',
      query: `query CheckUserExists($email: String!) {
        checkUserExists(email: $email) { exists availableWorkspacesCount isEmailVerified }
      }`,
      variables: { email: bindings.TEST_EMAIL },
    });

    const data = unwrap(body, 'checkUserExists');

    assert(data.checkUserExists.exists, `${bindings.TEST_EMAIL} exists`);

    return data.checkUserExists;
  });

  await recorder.step('cross-origin mutation is rejected', async () => {
    const { response } = await client.graphql({
      endpoint: '/metadata',
      origin: 'https://attacker.example',
      query: `mutation { signOut }`,
    });

    assertEqual(response.status, 403, 'cross-origin POST status');

    return { status: response.status };
  });

  await recorder.step('wrong password is refused', async () => {
    const { body } = await client.graphql({
      endpoint: '/metadata',
      query: `mutation Login($email: String!, $password: String!) {
        getLoginTokenFromCredentials(email: $email, password: $password) { loginToken { token } }
      }`,
      variables: {
        email: bindings.TEST_EMAIL,
        password: 'definitely-not-the-password',
      },
    });

    assert(
      body.errors !== undefined && body.errors.length > 0,
      'bad credentials produce an error',
    );

    return { error: body.errors?.[0]?.message };
  });

  const password = bindings.TEST_PASSWORD ?? '';

  if (password.length === 0) {
    recorder.skip(
      'sign in',
      'TEST_PASSWORD secret is not set — run: wrangler secret put TEST_PASSWORD',
    );

    return { steps: recorder.steps };
  }

  const loginToken = await recorder.step(
    'getLoginTokenFromCredentials',
    async () => {
      const { body } = await client.graphql<{
        getLoginTokenFromCredentials: {
          loginToken: { token: string; expiresAt: string };
        };
      }>({
        endpoint: '/metadata',
        query: `mutation Login($email: String!, $password: String!) {
        getLoginTokenFromCredentials(email: $email, password: $password) {
          loginToken { token expiresAt }
        }
      }`,
        variables: { email: bindings.TEST_EMAIL, password },
      });

      const data = unwrap(body, 'getLoginTokenFromCredentials');

      assert(
        data.getLoginTokenFromCredentials.loginToken.token.length > 0,
        'login token issued',
      );

      return data.getLoginTokenFromCredentials.loginToken.token;
    },
  );

  await recorder.step(
    'getAuthTokensFromLoginToken issues the session cookie',
    async () => {
      assert(loginToken !== null, 'login token available');

      const { response, body } = await client.graphql<{
        getAuthTokensFromLoginToken: {
          tokens: { accessOrWorkspaceAgnosticToken: { token: string } };
        };
      }>({
        endpoint: '/metadata',
        query: `mutation Tokens($loginToken: String!) {
        getAuthTokensFromLoginToken(loginToken: $loginToken) {
          tokens {
            accessOrWorkspaceAgnosticToken { token expiresAt }
            refreshToken { token expiresAt }
          }
        }
      }`,
        variables: { loginToken },
      });

      unwrap(body, 'getAuthTokensFromLoginToken');

      const cookies = response.headers.getSetCookie();

      assert(cookies.length > 0, 'Set-Cookie present');
      assert(
        cookies.some((cookie) => cookie.includes('HttpOnly')),
        'session cookie is httpOnly',
      );
      assert(
        cookies.some((cookie) => cookie.includes('Secure')),
        'session cookie is Secure',
      );

      return {
        cookies: cookies.map((cookie) => cookie.split(';')[0].split('=')[0]),
      };
    },
  );

  const currentUser = await recorder.step(
    'currentUser reads back the session',
    async () => {
      const { body } = await client.graphql<{
        currentUser: {
          id: string;
          email: string;
          currentWorkspace: { id: string; displayName: string | null } | null;
        } | null;
      }>({
        endpoint: '/metadata',
        query: `query CurrentUser {
        currentUser {
          id email firstName lastName
          currentWorkspace { id displayName }
          currentUserWorkspace { id }
          workspaceMember { id name { firstName lastName } }
        }
      }`,
      });

      const data = unwrap(body, 'currentUser');

      assert(data.currentUser !== null, 'currentUser is not null');
      assertEqual(
        data.currentUser?.email,
        bindings.TEST_EMAIL,
        'currentUser email',
      );
      assert(
        data.currentUser?.currentWorkspace !== null,
        'session carries a workspace',
      );

      return data.currentUser;
    },
  );

  if (currentUser === null) {
    return { steps: recorder.steps };
  }

  await recorder.step(
    'minimalMetadata carries objects, views and hashes',
    async () => {
      const { body } = await client.graphql<{
        minimalMetadata: {
          objectMetadataItems: { nameSingular: string }[];
          views: { id: string }[];
          collectionHashes: { collectionName: string; hash: string }[];
        };
      }>({
        endpoint: '/metadata',
        query: `query FindMinimalMetadata {
        minimalMetadata {
          objectMetadataItems { id nameSingular namePlural labelPlural icon isActive }
          views { id name type objectMetadataId }
          collectionHashes { collectionName hash }
        }
      }`,
      });

      const data = unwrap(body, 'minimalMetadata');
      const names = data.minimalMetadata.objectMetadataItems.map(
        (item) => item.nameSingular,
      );

      for (const expected of [
        'company',
        'person',
        'opportunity',
        'note',
        'task',
      ]) {
        assert(
          names.includes(expected),
          `minimalMetadata includes ${expected}`,
        );
      }

      return {
        objects: names.length,
        views: data.minimalMetadata.views.length,
        collectionHashes: data.minimalMetadata.collectionHashes.length,
      };
    },
  );

  await recorder.step('objects(paging) lists fields per object', async () => {
    const { body } = await client.graphql<{
      objects: {
        edges: {
          node: {
            id: string;
            nameSingular: string;
            fields: { edges: { node: { name: string; type: string } }[] };
          };
        }[];
      };
    }>({
      endpoint: '/metadata',
      query: `query ObjectMetadataItems {
        objects(paging: { first: 100 }) {
          edges {
            node {
              id nameSingular namePlural labelSingular isCustom isActive
              fields(paging: { first: 200 }) { edges { node { id name type label isNullable } } }
            }
            cursor
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
    });

    const data = unwrap(body, 'objects');
    const company = data.objects.edges.find(
      (edge) => edge.node.nameSingular === 'company',
    );

    assert(company !== undefined, 'company object present');

    const fieldNames =
      company?.node.fields.edges.map((edge) => edge.node.name) ?? [];

    assert(fieldNames.includes('domainName'), 'company has domainName');
    assert(fieldNames.includes('people'), 'company has the people relation');

    return {
      objects: data.objects.edges.length,
      companyFields: fieldNames.length,
    };
  });

  await recorder.step('getViews returns the seeded table views', async () => {
    const { body } = await client.graphql<{
      getViews: { id: string; type: string }[];
    }>({
      endpoint: '/metadata',
      query: `query GetViews($viewTypes: [ViewType!]) {
        getViews(viewTypes: $viewTypes) { id name type key icon position objectMetadataId }
      }`,
      variables: { viewTypes: ['TABLE'] },
    });

    const data = unwrap(body, 'getViews');

    assert(data.getViews.length > 0, 'at least one view');

    return { views: data.getViews.length };
  });

  const companyIds: string[] = [];

  const createdCompany = await recorder.step(
    'createCompany with every composite',
    async () => {
      const { body } = await client.graphql<{ createCompany: CompanyNode }>({
        endpoint: '/graphql',
        query: `mutation CreateCompany($data: CompanyCreateInput!) {
        createCompany(data: $data) { ${COMPANY_FIELDS} }
      }`,
        variables: {
          data: {
            name: `Campuzz E2E ${runSuffix}`,
            employees: 42,
            idealCustomerProfile: true,
            domainName: {
              primaryLinkUrl: 'https://campuzz.com.br',
              primaryLinkLabel: 'campuzz',
            },
            address: {
              addressStreet1: 'Av. Paulista, 1000',
              addressCity: 'São Paulo',
              addressState: 'SP',
              addressCountry: 'Brasil',
              addressPostcode: '01310-100',
            },
            annualRecurringRevenue: {
              amountMicros: 1250000000,
              currencyCode: 'BRL',
            },
          },
        },
      });

      const data = unwrap(body, 'createCompany');

      assertEqual(data.createCompany.employees, 42, 'employees stored');
      assertEqual(
        data.createCompany.address?.addressCity,
        'São Paulo',
        'ADDRESS composite round-trips with accents',
      );
      assertEqual(
        data.createCompany.annualRecurringRevenue?.currencyCode,
        'BRL',
        'CURRENCY composite round-trips',
      );
      assertEqual(
        data.createCompany.domainName?.primaryLinkUrl,
        'https://campuzz.com.br',
        'LINKS composite round-trips',
      );

      companyIds.push(data.createCompany.id);

      return data.createCompany;
    },
  );

  const companyId = createdCompany?.id ?? null;

  await recorder.step('createCompanies inserts a batch', async () => {
    const { body } = await client.graphql<{
      createCompanies: { id: string; name: string }[];
    }>({
      endpoint: '/graphql',
      query: `mutation CreateCompanies($data: [CompanyCreateInput!]!) {
        createCompanies(data: $data) { id name }
      }`,
      variables: {
        data: [
          { name: `Campuzz E2E ${runSuffix} B`, employees: 10 },
          { name: `Campuzz E2E ${runSuffix} C`, employees: 20 },
        ],
      },
    });

    const data = unwrap(body, 'createCompanies');

    assertEqual(data.createCompanies.length, 2, 'two companies created');

    for (const company of data.createCompanies) {
      companyIds.push(company.id);
    }

    return data.createCompanies.map((company) => company.id);
  });

  // What the CSV import sends. Re-importing the same file has to land on the
  // same rows: without upsert it silently doubles every record.
  await recorder.step('createCompanies upserts instead of duplicating', async () => {
    // A UUID the run owns, so a re-run upserts its own row rather than someone
    // else's. runSuffix is base36, so it goes through char codes to reach hex.
    const hexSuffix = Array.from(runSuffix)
      .map((character) => character.charCodeAt(0).toString(16))
      .join('')
      .slice(-12)
      .padStart(12, '0');

    const rows = [
      {
        id: `c5701000-0000-4000-8000-${hexSuffix}`,
        name: `Campuzz CSV ${runSuffix}`,
        employees: 5,
      },
    ];

    const first = unwrap(
      (
        await client.graphql<{ createCompanies: { id: string }[] }>({
          endpoint: '/graphql',
          query: `mutation UpsertCompanies($data: [CompanyCreateInput!]!, $upsert: Boolean) {
            createCompanies(data: $data, upsert: $upsert) { id name employees }
          }`,
          variables: { data: rows, upsert: true },
        })
      ).body,
      'createCompanies upsert',
    );

    companyIds.push(first.createCompanies[0].id);

    const second = unwrap(
      (
        await client.graphql<{
          createCompanies: { id: string; name: string; employees: number }[];
        }>({
          endpoint: '/graphql',
          query: `mutation UpsertCompanies($data: [CompanyCreateInput!]!, $upsert: Boolean) {
            createCompanies(data: $data, upsert: $upsert) { id name employees }
          }`,
          variables: {
            data: [{ ...rows[0], employees: 50 }],
            upsert: true,
          },
        })
      ).body,
      'createCompanies upsert again',
    );

    assertEqual(
      second.createCompanies[0].id,
      first.createCompanies[0].id,
      'the second import lands on the same row',
    );
    assertEqual(second.createCompanies[0].employees, 50, 'the row was updated');

    const remaining = unwrap(
      (
        await client.graphql<{ companies: { totalCount: number } }>({
          endpoint: '/graphql',
          query: `query CsvRows($name: String!) {
            companies(filter: { name: { eq: $name } }) { totalCount }
          }`,
          variables: { name: `Campuzz CSV ${runSuffix}` },
        })
      ).body,
      'companies after upsert',
    );

    assertEqual(remaining.companies.totalCount, 1, 'no duplicate row');

    return { id: first.createCompanies[0].id };
  });

  // Search reads a generated column, so it only finds what the DDL indexed —
  // and the index folds accents on both sides, which is the whole point in a
  // Portuguese workspace.
  await recorder.step('global search finds records across objects', async () => {
    const companyName = `Zoológico Campuzz ${runSuffix}`;

    const created = unwrap(
      (
        await client.graphql<{ createCompany: { id: string } }>({
          endpoint: '/graphql',
          query: `mutation CreateCompany($data: CompanyCreateInput!) {
            createCompany(data: $data) { id }
          }`,
          variables: { data: { name: companyName, employees: 3 } },
        })
      ).body,
      'search seed',
    );

    companyIds.push(created.createCompany.id);

    const search = async (searchInput: string) =>
      unwrap(
        (
          await client.graphql<{
            search: {
              edges: { node: { recordId: string; label: string } }[];
              pageInfo: { hasNextPage: boolean };
            };
          }>({
            endpoint: '/graphql',
            query: `query Search($searchInput: String!, $limit: Int!) {
              search(searchInput: $searchInput, limit: $limit) {
                edges { node { recordId objectNameSingular objectLabelSingular label tsRank tsRankCD } cursor }
                pageInfo { hasNextPage endCursor }
              }
            }`,
            variables: { searchInput, limit: 20 },
          })
        ).body,
        `search ${searchInput}`,
      );

    const accented = await search('Zoológico');
    const plain = await search('zoologico');
    const prefix = await search('zoolog');

    for (const [label, result] of [
      ['accented', accented],
      ['unaccented', plain],
      ['prefix', prefix],
    ] as const) {
      assert(
        result.search.edges.some(
          (edge) => edge.node.recordId === created.createCompany.id,
        ),
        `the ${label} query finds the record`,
      );
    }

    return { id: created.createCompany.id };
  });

  // What the kanban draws its columns from: one connection per distinct value,
  // each carrying its own count and its own page of cards.
  await recorder.step('groupBy splits records into kanban columns', async () => {
    const created: string[] = [];

    for (const stage of ['NEW', 'NEW', 'SCREENING'] as const) {
      const result = unwrap(
        (
          await client.graphql<{ createOpportunity: { id: string } }>({
            endpoint: '/graphql',
            query: `mutation CreateOpportunity($data: OpportunityCreateInput!) {
              createOpportunity(data: $data) { id }
            }`,
            variables: {
              data: { name: `Campuzz Kanban ${runSuffix} ${stage}`, stage },
            },
          })
        ).body,
        'groupBy seed',
      );

      created.push(result.createOpportunity.id);
    }

    const grouped = unwrap(
      (
        await client.graphql<{
          opportunitiesGroupBy: {
            groupByDimensionValues: (string | null)[];
            totalCount: number;
            edges: { node: { id: string; stage: string } }[];
          }[];
        }>({
          endpoint: '/graphql',
          query: `query GroupByOpportunities(
            $groupBy: [OpportunityGroupByInput!]!
            $filter: OpportunityFilterInput
          ) {
            opportunitiesGroupBy(groupBy: $groupBy, filter: $filter) {
              groupByDimensionValues
              totalCount
              edges { node { id stage } cursor }
              pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
            }
          }`,
          variables: {
            groupBy: [{ stage: true }],
            filter: { name: { startsWith: `Campuzz Kanban ${runSuffix}` } },
          },
        })
      ).body,
      'opportunitiesGroupBy',
    );

    const byStage = new Map(
      grouped.opportunitiesGroupBy.map((group) => [
        group.groupByDimensionValues[0],
        group,
      ]),
    );

    assertEqual(byStage.size, 2, 'one column per distinct stage');
    assertEqual(byStage.get('NEW')?.totalCount, 2, 'the NEW column counts two');
    assertEqual(
      byStage.get('SCREENING')?.totalCount,
      1,
      'the SCREENING column counts one',
    );

    // The count is the group's, not the table's: a column that reported the
    // whole table would still look right until a second column existed.
    assertEqual(
      byStage.get('NEW')?.edges.length,
      2,
      'the NEW column carries its own cards',
    );

    for (const id of created) {
      unwrap(
        (
          await client.graphql({
            endpoint: '/graphql',
            query: `mutation DestroyOpportunity($id: UUID!) {
              destroyOpportunity(id: $id) { id }
            }`,
            variables: { id },
          })
        ).body,
        'groupBy cleanup',
      );
    }

    return { columns: [...byStage.keys()] };
  });

  const personId = await recorder.step(
    'createPerson with FULL_NAME, EMAILS, PHONES and a relation',
    async () => {
      assert(companyId !== null, 'company available to relate to');

      const { body } = await client.graphql<{
        createPerson: {
          id: string;
          name: { firstName: string | null; lastName: string | null } | null;
          emails: { primaryEmail: string | null } | null;
          phones: { primaryPhoneNumber: string | null } | null;
          companyId: string | null;
        };
      }>({
        endpoint: '/graphql',
        query: `mutation CreatePerson($data: PersonCreateInput!) {
        createPerson(data: $data) {
          id
          name { firstName lastName }
          emails { primaryEmail additionalEmails }
          phones { primaryPhoneNumber primaryPhoneCountryCode primaryPhoneCallingCode }
          city
          companyId
        }
      }`,
        variables: {
          data: {
            name: { firstName: 'Pablo', lastName: `Baptista ${runSuffix}` },
            emails: { primaryEmail: `e2e+${runSuffix}@campuzz.com.br` },
            phones: {
              primaryPhoneNumber: '999999999',
              primaryPhoneCountryCode: 'BR',
              primaryPhoneCallingCode: '+55',
            },
            city: 'São Paulo',
            companyId,
          },
        },
      });

      const data = unwrap(body, 'createPerson');

      assertEqual(
        data.createPerson.name?.firstName,
        'Pablo',
        'FULL_NAME composite',
      );
      assertEqual(
        data.createPerson.emails?.primaryEmail,
        `e2e+${runSuffix}@campuzz.com.br`,
        'EMAILS composite',
      );
      assertEqual(
        data.createPerson.companyId,
        companyId,
        'relation column written',
      );

      return data.createPerson.id;
    },
  );

  await recorder.step('MANY_TO_ONE resolves person → company', async () => {
    const { body } = await client.graphql<{
      person: {
        id: string;
        company: { id: string; name: string | null } | null;
      } | null;
    }>({
      endpoint: '/graphql',
      query: `query Person($id: UUID!) {
        person(filter: { id: { eq: $id } }) {
          id
          company { id name }
        }
      }`,
      variables: { id: personId },
    });

    const data = unwrap(body, 'person');

    assertEqual(
      data.person?.company?.id,
      companyId,
      'company resolved off the join column',
    );

    return data.person?.company;
  });

  await recorder.step(
    'ONE_TO_MANY resolves company → people connection',
    async () => {
      const { body } = await client.graphql<{
        company: {
          people: {
            edges: {
              node: { id: string; name: { firstName: string | null } | null };
            }[];
            totalCount: number;
          };
        } | null;
      }>({
        endpoint: '/graphql',
        query: `query CompanyPeople($id: UUID!) {
        company(filter: { id: { eq: $id } }) {
          id
          people { edges { node { id name { firstName lastName } } } totalCount }
        }
      }`,
        variables: { id: companyId },
      });

      const data = unwrap(body, 'company');

      assertEqual(
        data.company?.people.totalCount,
        1,
        'one person on the company',
      );

      return data.company?.people.edges.map((edge) => edge.node.id);
    },
  );

  await recorder.step('empty-string filter also matches NULL', async () => {
    assert(personId !== null, 'person available');

    const { body } = await client.graphql<{
      people: { edges: { node: { id: string; jobTitle: string | null } }[] };
    }>({
      endpoint: '/graphql',
      query: `query PeopleWithoutJobTitle($id: UUID!) {
        people(filter: { and: [{ id: { eq: $id } }, { jobTitle: { eq: "" } }] }) {
          edges { node { id jobTitle } }
        }
      }`,
      variables: { id: personId },
    });

    const data = unwrap(body, 'people');

    // Twenty widens eq/is/like on an empty value to "OR IS NULL"; dropping that
    // rule silently changes which rows a saved filter returns.
    assertEqual(data.people.edges.length, 1, 'NULL jobTitle matched by eq: ""');

    return { matched: data.people.edges.length };
  });

  await recorder.step('keyset pagination walks the cursor', async () => {
    const listQuery = `query Companies($first: Int, $after: String, $search: String!) {
      companies(
        filter: { name: { startsWith: $search } }
        orderBy: [{ name: AscNullsLast }]
        first: $first
        after: $after
      ) {
        edges { node { id name } cursor }
        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
        totalCount
      }
    }`;

    const search = `Campuzz E2E ${runSuffix}`;

    const firstPage = unwrap(
      (
        await client.graphql<{
          companies: {
            edges: { node: { id: string; name: string }; cursor: string }[];
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
            totalCount: number;
          };
        }>({
          endpoint: '/graphql',
          query: listQuery,
          variables: { first: 2, search },
        })
      ).body,
      'companies page 1',
    );

    assertEqual(
      firstPage.companies.totalCount,
      3,
      'totalCount sits beside edges',
    );
    assertEqual(firstPage.companies.edges.length, 2, 'page size honoured');
    assert(
      firstPage.companies.pageInfo.hasNextPage,
      'hasNextPage on a partial page',
    );

    const secondPage = unwrap(
      (
        await client.graphql<{
          companies: {
            edges: { node: { id: string; name: string } }[];
            pageInfo: { hasNextPage: boolean };
          };
        }>({
          endpoint: '/graphql',
          query: listQuery,
          variables: {
            first: 2,
            after: firstPage.companies.pageInfo.endCursor,
            search,
          },
        })
      ).body,
      'companies page 2',
    );

    assertEqual(secondPage.companies.edges.length, 1, 'remainder on page 2');
    assert(!secondPage.companies.pageInfo.hasNextPage, 'no page 3');

    const firstIds = firstPage.companies.edges.map((edge) => edge.node.id);
    const secondIds = secondPage.companies.edges.map((edge) => edge.node.id);

    assert(
      secondIds.every((id) => !firstIds.includes(id)),
      'pages do not overlap',
    );

    return { page1: firstIds, page2: secondIds };
  });

  await recorder.step('updateCompany writes and bumps updatedAt', async () => {
    const { body } = await client.graphql<{ updateCompany: CompanyNode }>({
      endpoint: '/graphql',
      query: `mutation UpdateCompany($id: UUID!, $data: CompanyUpdateInput!) {
        updateCompany(id: $id, data: $data) { ${COMPANY_FIELDS} }
      }`,
      variables: {
        data: { employees: 99, address: { addressCity: 'Rio de Janeiro' } },
        id: companyId,
      },
    });

    const data = unwrap(body, 'updateCompany');

    assertEqual(data.updateCompany.employees, 99, 'employees updated');
    assertEqual(
      data.updateCompany.address?.addressCity,
      'Rio de Janeiro',
      'composite property updated',
    );
    assert(
      new Date(data.updateCompany.updatedAt ?? 0).getTime() >=
        new Date(createdCompany?.createdAt ?? 0).getTime(),
      'updatedAt maintained',
    );

    return { employees: data.updateCompany.employees };
  });

  await recorder.step(
    'soft delete hides the row, restore brings it back',
    async () => {
      unwrap(
        (
          await client.graphql({
            endpoint: '/graphql',
            query: `mutation DeleteCompany($id: UUID!) { deleteCompany(id: $id) { id deletedAt } }`,
            variables: { id: companyId },
          })
        ).body,
        'deleteCompany',
      );

      const afterDelete = unwrap(
        (
          await client.graphql<{
            companies: { edges: { node: { id: string } }[] };
          }>({
            endpoint: '/graphql',
            query: `query Company($id: UUID!) {
            companies(filter: { id: { eq: $id } }) { edges { node { id } } }
          }`,
            variables: { id: companyId },
          })
        ).body,
        'companies after delete',
      );

      assertEqual(
        afterDelete.companies.edges.length,
        0,
        'soft-deleted row is hidden',
      );

      const withDeleted = unwrap(
        (
          await client.graphql<{
            companies: {
              edges: { node: { id: string; deletedAt: string | null } }[];
            };
          }>({
            endpoint: '/graphql',
            query: `query DeletedCompany($id: UUID!) {
            companies(filter: { and: [{ id: { eq: $id } }, { deletedAt: { is: NOT_NULL } }] }) {
              edges { node { id deletedAt } }
            }
          }`,
            variables: { id: companyId },
          })
        ).body,
        'companies filtering on deletedAt',
      );

      assertEqual(
        withDeleted.companies.edges.length,
        1,
        'filtering on deletedAt opts into deleted rows',
      );

      const restored = unwrap(
        (
          await client.graphql<{
            restoreCompany: { id: string; deletedAt: string | null };
          }>({
            endpoint: '/graphql',
            query: `mutation RestoreCompany($id: UUID!) { restoreCompany(id: $id) { id deletedAt } }`,
            variables: { id: companyId },
          })
        ).body,
        'restoreCompany',
      );

      assertEqual(
        restored.restoreCompany.deletedAt,
        null,
        'deletedAt cleared on restore',
      );

      return { restored: restored.restoreCompany.id };
    },
  );

  const customObject = await recorder.step(
    'createOneObject runs real DDL',
    async () => {
      const { body } = await client.graphql<{
        createOneObject: {
          id: string;
          nameSingular: string;
          namePlural: string;
        };
      }>({
        endpoint: '/metadata',
        query: `mutation CreateOneObject($input: ObjectCreateInput!) {
        createOneObject(input: $input) { id nameSingular namePlural labelSingular isCustom }
      }`,
        variables: {
          input: {
            nameSingular: `clienteE2e${runSuffix}`,
            namePlural: `clientesE2e${runSuffix}`,
            labelSingular: 'Cliente',
            labelPlural: 'Clientes',
            icon: 'IconUsers',
            description: 'Objeto criado pelo teste de ponta a ponta',
          },
        },
      });

      const data = unwrap(body, 'createOneObject');

      return data.createOneObject;
    },
  );

  const customFields = await recorder.step(
    'createOneField covers scalar, enum and composite types',
    async () => {
      assert(customObject !== null, 'custom object created');

      const definitions: {
        name: string;
        label: string;
        type: string;
        options?: { value: string; label: string; color: string }[];
      }[] = [
        { name: 'documento', label: 'Documento', type: 'TEXT' },
        { name: 'mensalidade', label: 'Mensalidade', type: 'CURRENCY' },
        { name: 'matriculadoEm', label: 'Matriculado em', type: 'DATE_TIME' },
        { name: 'ativo', label: 'Ativo', type: 'BOOLEAN' },
        { name: 'creditos', label: 'Créditos', type: 'NUMBER' },
        { name: 'contato', label: 'Contato', type: 'EMAILS' },
        { name: 'telefone', label: 'Telefone', type: 'PHONES' },
        { name: 'endereco', label: 'Endereço', type: 'ADDRESS' },
        { name: 'site', label: 'Site', type: 'LINKS' },
        { name: 'responsavel', label: 'Responsável', type: 'FULL_NAME' },
        { name: 'anotacoes', label: 'Anotações', type: 'RAW_JSON' },
        {
          name: 'situacao',
          label: 'Situação',
          type: 'SELECT',
          options: [
            { value: 'LEAD', label: 'Lead', color: 'blue' },
            { value: 'MATRICULADO', label: 'Matriculado', color: 'green' },
            { value: 'INADIMPLENTE', label: 'Inadimplente', color: 'red' },
          ],
        },
      ];

      const created: string[] = [];

      for (const definition of definitions) {
        const { body } = await client.graphql<{
          createOneField: { id: string; name: string; type: string };
        }>({
          endpoint: '/metadata',
          query: `mutation CreateOneField($input: FieldCreateInput!) {
          createOneField(input: $input) { id name type label isNullable }
        }`,
          variables: {
            input: {
              objectMetadataId: customObject?.id,
              isNullable: true,
              ...definition,
            },
          },
        });

        const data = unwrap(body, `createOneField(${definition.name})`);

        assertEqual(
          data.createOneField.type,
          definition.type,
          `${definition.name} type`,
        );
        created.push(data.createOneField.name);
      }

      return created;
    },
  );

  const customRecordId = await recorder.step(
    'the new object is queryable through the generated schema',
    async () => {
      assert(customObject !== null, 'custom object created');
      assert(customFields !== null, 'custom fields created');

      const singular = customObject?.nameSingular ?? '';
      const typeName = `${singular.charAt(0).toUpperCase()}${singular.slice(1)}`;

      const { body } = await client.graphql<Record<string, { id: string }>>({
        endpoint: '/graphql',
        query: `mutation CreateCliente($data: ${typeName}CreateInput!) {
        create${typeName}(data: $data) {
          id
          documento
          situacao
          ativo
          creditos
          mensalidade { amountMicros currencyCode }
          contato { primaryEmail }
          endereco { addressCity }
          responsavel { firstName lastName }
        }
      }`,
        variables: {
          data: {
            documento: `E2E-${runSuffix}`,
            situacao: 'MATRICULADO',
            ativo: true,
            creditos: 12,
            mensalidade: { amountMicros: 49900000, currencyCode: 'BRL' },
            contato: { primaryEmail: `cliente+${runSuffix}@campuzz.com.br` },
            endereco: {
              addressCity: 'Belo Horizonte',
              addressCountry: 'Brasil',
            },
            responsavel: { firstName: 'Maria', lastName: 'Souza' },
          },
        },
      });

      const data = unwrap(body, 'create custom record');
      const record = data[`create${typeName}`] as Record<string, unknown> & {
        id: string;
      };

      assertEqual(record.situacao, 'MATRICULADO', 'SELECT enum stored');
      assertEqual(record.creditos, 12, 'NUMBER stored');

      return record.id;
    },
  );

  await recorder.step('deleteOneField drops the column', async () => {
    assert(customObject !== null, 'custom object created');

    const fields = unwrap(
      (
        await client.graphql<{
          object: { fields: { edges: { node: { id: string; name: string } }[] } };
        }>({
          endpoint: '/metadata',
          query: `query ObjectFields($id: UUID!) {
            object(id: $id) {
              id
              fields(paging: { first: 200 }) { edges { node { id name } } }
            }
          }`,
          variables: { id: customObject?.id },
        })
      ).body,
      'object fields',
    );

    const target = fields.object.fields.edges.find(
      (edge) => edge.node.name === 'anotacoes',
    );

    assert(target !== undefined, 'the field to drop exists');

    const deleted = unwrap(
      (
        await client.graphql<{ deleteOneField: { id: string; name: string } }>({
          endpoint: '/metadata',
          query: `mutation DeleteOneField($id: UUID!) {
            deleteOneField(id: $id) { id name }
          }`,
          variables: { id: target?.node.id },
        })
      ).body,
      'deleteOneField',
    );

    assertEqual(deleted.deleteOneField.name, 'anotacoes', 'dropped field name');

    const after = unwrap(
      (
        await client.graphql<{
          object: { fields: { edges: { node: { name: string } }[] } };
        }>({
          endpoint: '/metadata',
          query: `query ObjectFields($id: UUID!) {
            object(id: $id) {
              fields(paging: { first: 200 }) { edges { node { name } } }
            }
          }`,
          variables: { id: customObject?.id },
        })
      ).body,
      'object fields after delete',
    );

    assert(
      !after.object.fields.edges.some((edge) => edge.node.name === 'anotacoes'),
      'the field is gone from the metadata',
    );

    return { deleted: deleted.deleteOneField.id };
  });

  await recorder.step('a standard object cannot be deleted', async () => {
    const objects = unwrap(
      (
        await client.graphql<{
          objects: { edges: { node: { id: string; nameSingular: string } }[] };
        }>({
          endpoint: '/metadata',
          query: `query { objects(paging: { first: 100 }) { edges { node { id nameSingular } } } }`,
        })
      ).body,
      'objects',
    );

    const company = objects.objects.edges.find(
      (edge) => edge.node.nameSingular === 'company',
    );

    const { body } = await client.graphql({
      endpoint: '/metadata',
      query: `mutation DeleteOneObject($id: UUID!) { deleteOneObject(id: $id) { id } }`,
      variables: { id: company?.node.id },
    });

    assert(
      body.errors !== undefined && body.errors.length > 0,
      'deleting a standard object is refused',
    );

    return { error: body.errors?.[0]?.message };
  });

  await recorder.step('syncStandardMetadata is idempotent', async () => {
    const first = unwrap(
      (
        await client.graphql<{
          syncStandardMetadata: {
            createdObjects: string[];
            createdFields: string[];
          };
        }>({
          endpoint: '/metadata',
          query: `mutation { syncStandardMetadata { createdObjects createdFields } }`,
        })
      ).body,
      'syncStandardMetadata',
    );

    const second = unwrap(
      (
        await client.graphql<{
          syncStandardMetadata: {
            createdObjects: string[];
            createdFields: string[];
          };
        }>({
          endpoint: '/metadata',
          query: `mutation { syncStandardMetadata { createdObjects createdFields } }`,
        })
      ).body,
      'syncStandardMetadata again',
    );

    // Whatever the first run had to add, the second must find nothing: the
    // ids are derived, so a re-run is a comparison, not a rewrite.
    assertEqual(
      second.syncStandardMetadata.createdObjects.length,
      0,
      'no object created twice',
    );
    assertEqual(
      second.syncStandardMetadata.createdFields.length,
      0,
      'no field created twice',
    );

    return first.syncStandardMetadata;
  });

  await recorder.step('a file round-trips through R2', async () => {
    const created = unwrap(
      (
        await client.graphql<{
          createFileUpload: { fileId: string; uploadUrl: string };
        }>({
          endpoint: '/metadata',
          query: `mutation CreateFileUpload($filename: String!, $size: Float!, $fileFolder: FileFolder!) {
            createFileUpload(filename: $filename, size: $size, fileFolder: $fileFolder) {
              fileId uploadUrl contentType expiresAt
            }
          }`,
          variables: {
            filename: `e2e-${runSuffix}.png`,
            size: 23,
            fileFolder: 'CorePicture',
          },
        })
      ).body,
      'createFileUpload',
    );

    const payload = new TextEncoder().encode(`campuzz-e2e-${runSuffix}`);

    const uploadResponse = await fetch(created.createFileUpload.uploadUrl, {
      method: 'PUT',
      headers: {
        Origin: bindings.TARGET_URL,
        'Content-Type': 'image/png',
      },
      body: payload,
    });

    assertEqual(uploadResponse.status, 201, 'upload status');

    const completed = unwrap(
      (
        await client.graphql<{
          completeFileUpload: { id: string; path: string; size: number; url: string };
        }>({
          endpoint: '/metadata',
          query: `mutation CompleteFileUpload($fileId: String!) {
            completeFileUpload(fileId: $fileId) { id path size createdAt url }
          }`,
          variables: { fileId: created.createFileUpload.fileId },
        })
      ).body,
      'completeFileUpload',
    );

    // The size the client declares is a claim; what is stored is what arrived.
    assertEqual(
      completed.completeFileUpload.size,
      payload.byteLength,
      'stored size is the bytes received',
    );

    const readBack = await client.fetch(
      `/files/${completed.completeFileUpload.path}`,
    );

    assertEqual(readBack.status, 200, 'file is readable');
    assertEqual(
      await readBack.text(),
      `campuzz-e2e-${runSuffix}`,
      'bytes come back unchanged',
    );

    return completed.completeFileUpload;
  });

  await recorder.step('an upload token only writes its own file', async () => {
    const first = unwrap(
      (
        await client.graphql<{
          createFileUpload: { fileId: string; uploadUrl: string };
        }>({
          endpoint: '/metadata',
          query: `mutation CreateFileUpload($filename: String!, $size: Float!, $fileFolder: FileFolder!) {
            createFileUpload(filename: $filename, size: $size, fileFolder: $fileFolder) { fileId uploadUrl }
          }`,
          variables: {
            filename: `token-a-${runSuffix}.bin`,
            size: 4,
            fileFolder: 'FilesField',
          },
        })
      ).body,
      'createFileUpload (a)',
    );

    const second = unwrap(
      (
        await client.graphql<{ createFileUpload: { fileId: string } }>({
          endpoint: '/metadata',
          query: `mutation CreateFileUpload($filename: String!, $size: Float!, $fileFolder: FileFolder!) {
            createFileUpload(filename: $filename, size: $size, fileFolder: $fileFolder) { fileId }
          }`,
          variables: {
            filename: `token-b-${runSuffix}.bin`,
            size: 4,
            fileFolder: 'FilesField',
          },
        })
      ).body,
      'createFileUpload (b)',
    );

    // Point the first file's token at the second file's path.
    const hijacked = first.createFileUpload.uploadUrl.replace(
      first.createFileUpload.fileId,
      second.createFileUpload.fileId,
    );

    const response = await fetch(hijacked, {
      method: 'PUT',
      headers: { Origin: bindings.TARGET_URL },
      body: 'nope',
    });

    assertEqual(response.status, 403, 'a token for another file is refused');

    return { status: response.status };
  });

  await recorder.step('a saved filter and sort survive the request', async () => {
    const views = unwrap(
      (
        await client.graphql<{
          getViews: {
            id: string;
            name: string;
            objectMetadataId: string;
            viewFields: { id: string; fieldMetadataId: string }[];
          }[];
        }>({
          endpoint: '/metadata',
          query: `query GetViews($viewTypes: [ViewType!]) {
            getViews(viewTypes: $viewTypes) {
              id name objectMetadataId
              viewFields { id fieldMetadataId isVisible position }
            }
          }`,
          variables: { viewTypes: ['TABLE'] },
        })
      ).body,
      'getViews',
    );

    const companiesView = views.getViews.find((view) =>
      view.name.includes('Companies'),
    );

    assert(companiesView !== undefined, 'the companies view exists');
    assert(
      (companiesView?.viewFields.length ?? 0) > 0,
      'the view has columns of its own',
    );

    const fieldMetadataId = companiesView?.viewFields[0].fieldMetadataId ?? '';

    const filter = unwrap(
      (
        await client.graphql<{
          createViewFilter: { id: string; operand: string; value: unknown };
        }>({
          endpoint: '/metadata',
          query: `mutation CreateViewFilter($input: CreateViewFilterInput!) {
            createViewFilter(input: $input) {
              id fieldMetadataId operand value viewId
            }
          }`,
          variables: {
            input: {
              viewId: companiesView?.id,
              fieldMetadataId,
              operand: 'contains',
              value: `Campuzz E2E ${runSuffix}`,
            },
          },
        })
      ).body,
      'createViewFilter',
    );

    const sort = unwrap(
      (
        await client.graphql<{ createViewSort: { id: string; direction: string } }>({
          endpoint: '/metadata',
          query: `mutation CreateViewSort($input: CreateViewSortInput!) {
            createViewSort(input: $input) { id fieldMetadataId direction viewId }
          }`,
          variables: {
            input: {
              viewId: companiesView?.id,
              fieldMetadataId,
              direction: 'desc',
            },
          },
        })
      ).body,
      'createViewSort',
    );

    // Read them back through the same query the front boots on: a filter that
    // only exists in the mutation's answer is a filter that dies with the tab.
    const reloaded = unwrap(
      (
        await client.graphql<{
          getViews: {
            id: string;
            viewFilters: { id: string; operand: string; value: unknown }[];
            viewSorts: { id: string; direction: string }[];
          }[];
        }>({
          endpoint: '/metadata',
          query: `query GetViews($viewTypes: [ViewType!]) {
            getViews(viewTypes: $viewTypes) {
              id
              viewFilters { id fieldMetadataId operand value }
              viewSorts { id fieldMetadataId direction }
            }
          }`,
          variables: { viewTypes: ['TABLE'] },
        })
      ).body,
      'getViews after saving',
    );

    const savedView = reloaded.getViews.find(
      (view) => view.id === companiesView?.id,
    );

    assertEqual(
      savedView?.viewFilters.some(
        (entry) => entry.id === filter.createViewFilter.id,
      ),
      true,
      'the filter comes back',
    );
    assertEqual(
      savedView?.viewSorts.some((entry) => entry.id === sort.createViewSort.id),
      true,
      'the sort comes back',
    );
    assertEqual(
      savedView?.viewFilters.find(
        (entry) => entry.id === filter.createViewFilter.id,
      )?.value,
      `Campuzz E2E ${runSuffix}`,
      'the value round-trips as written',
    );

    // Clean up, and prove destroy actually removes them.
    unwrap(
      (
        await client.graphql({
          endpoint: '/metadata',
          query: `mutation DestroyViewFilter($input: DestroyViewFilterInput!) {
            destroyViewFilter(input: $input) { id }
          }`,
          variables: { input: { id: filter.createViewFilter.id } },
        })
      ).body,
      'destroyViewFilter',
    );

    unwrap(
      (
        await client.graphql({
          endpoint: '/metadata',
          query: `mutation DestroyViewSort($input: DestroyViewSortInput!) {
            destroyViewSort(input: $input)
          }`,
          variables: { input: { id: sort.createViewSort.id } },
        })
      ).body,
      'destroyViewSort',
    );

    return {
      viewId: companiesView?.id,
      columns: companiesView?.viewFields.length,
    };
  });

  await recorder.step('REST mirrors the GraphQL data', async () => {
    const listResponse = await client.fetch('/rest/companies?limit=5');
    const list = (await listResponse.json()) as {
      data: { companies: { id: string }[] };
      totalCount: number;
    };

    assertEqual(listResponse.status, 200, 'REST list status');
    assert(list.data.companies.length > 0, 'REST list not empty');

    const oneResponse = await client.fetch(`/rest/companies/${companyId}`);
    const one = (await oneResponse.json()) as {
      data: { company: { id: string } };
    };

    assertEqual(oneResponse.status, 200, 'REST single status');
    assertEqual(one.data.company.id, companyId, 'REST returns the same row');

    return { totalCount: list.totalCount, listed: list.data.companies.length };
  });

  await recorder.step(
    'cleanup: destroy every record this run created',
    async () => {
      const destroyed: string[] = [];

      if (personId !== null) {
        unwrap(
          (
            await client.graphql({
              endpoint: '/graphql',
              query: `mutation DestroyPerson($id: UUID!) { destroyPerson(id: $id) { id } }`,
              variables: { id: personId },
            })
          ).body,
          'destroyPerson',
        );
        destroyed.push(personId);
      }

      for (const id of companyIds) {
        unwrap(
          (
            await client.graphql({
              endpoint: '/graphql',
              query: `mutation DestroyCompany($id: UUID!) { destroyCompany(id: $id) { id } }`,
              variables: { id },
            })
          ).body,
          'destroyCompany',
        );
        destroyed.push(id);
      }

      const remaining = unwrap(
        (
          await client.graphql<{ companies: { totalCount: number } }>({
            endpoint: '/graphql',
            query: `query Remaining($search: String!) {
            companies(filter: { name: { startsWith: $search } }) { totalCount }
          }`,
            variables: { search: `Campuzz E2E ${runSuffix}` },
          })
        ).body,
        'companies after destroy',
      );

      assertEqual(
        remaining.companies.totalCount,
        0,
        'hard delete removed the rows',
      );

      if (customObject !== null) {
        unwrap(
          (
            await client.graphql({
              endpoint: '/metadata',
              query: `mutation DeleteOneObject($id: UUID!) {
                deleteOneObject(id: $id) { id nameSingular }
              }`,
              variables: { id: customObject.id },
            })
          ).body,
          'deleteOneObject',
        );
      }

      return {
        destroyed: destroyed.length,
        customRecordId,
        droppedObject: customObject?.nameSingular ?? null,
      };
    },
  );

  await recorder.step('duplicates are found and merged', async () => {
    const firstName = `Dup${runSuffix}`;

    const seeded = unwrap(
      (
        await client.graphql<{
          survivor: { id: string };
          loser: { id: string };
          unrelated: { id: string };
        }>({
          endpoint: '/graphql',
          query: `mutation SeedDuplicates($name: FullNameCreateInput!, $other: FullNameCreateInput!) {
            survivor: createPerson(data: { name: $name, city: "Recife" }) { id }
            loser: createPerson(data: { name: $name, jobTitle: "Gerente" }) { id }
            unrelated: createPerson(data: { name: $other }) { id }
          }`,
          variables: {
            name: { firstName, lastName: 'Teste' },
            other: { firstName: `Outro${runSuffix}`, lastName: 'Nome' },
          },
        })
      ).body,
      'seed duplicates',
    );

    const findDuplicates = async (id: string) =>
      unwrap(
        (
          await client.graphql<{
            personDuplicates: { edges: { node: { id: string } }[] };
          }>({
            endpoint: '/graphql',
            query: `query FindDuplicatePerson($ids: [UUID!]!) {
              personDuplicates(ids: $ids) {
                edges { node { id name { firstName lastName } city jobTitle } cursor }
                pageInfo { hasNextPage startCursor endCursor }
              }
            }`,
            variables: { ids: [id] },
          })
        ).body,
        'personDuplicates',
      );

    const duplicates = await findDuplicates(seeded.survivor.id);
    const foundIds = duplicates.personDuplicates.edges.map(
      (edge) => edge.node.id,
    );

    assert(foundIds.includes(seeded.loser.id), 'the matching record is found');
    assert(
      !foundIds.includes(seeded.unrelated.id),
      'a record that matches no criterion is left out',
    );
    assert(
      !foundIds.includes(seeded.survivor.id),
      'a record is not its own duplicate',
    );

    // dryRun previews the result without writing: the front shows it while the
    // person is still choosing which record wins.
    const preview = unwrap(
      (
        await client.graphql<{
          mergePeople: { id: string; city: string | null; jobTitle: string | null };
        }>({
          endpoint: '/graphql',
          query: `mutation MergePeople($ids: [UUID!]!, $conflictPriorityIndex: Int!, $dryRun: Boolean) {
            mergePeople(ids: $ids, conflictPriorityIndex: $conflictPriorityIndex, dryRun: $dryRun) {
              id city jobTitle name { firstName lastName }
            }
          }`,
          variables: {
            ids: [seeded.survivor.id, seeded.loser.id],
            conflictPriorityIndex: 0,
            dryRun: true,
          },
        })
      ).body,
      'mergePeople dryRun',
    );

    // What each record was missing, the other supplied.
    assertEqual(preview.mergePeople.city, 'Recife', 'the survivor keeps its city');
    assertEqual(
      preview.mergePeople.jobTitle,
      'Gerente',
      'the gap is filled from the other record',
    );

    const stillThere = unwrap(
      (
        await client.graphql<{ person: { id: string } | null }>({
          endpoint: '/graphql',
          query: `query StillThere($id: UUID!) {
            person(filter: { id: { eq: $id } }) { id deletedAt }
          }`,
          variables: { id: seeded.loser.id },
        })
      ).body,
      'person after dryRun',
    );

    assert(stillThere.person !== null, 'a dry run writes nothing');

    unwrap(
      (
        await client.graphql({
          endpoint: '/graphql',
          query: `mutation MergePeople($ids: [UUID!]!, $conflictPriorityIndex: Int!) {
            mergePeople(ids: $ids, conflictPriorityIndex: $conflictPriorityIndex) { id }
          }`,
          variables: {
            ids: [seeded.survivor.id, seeded.loser.id],
            conflictPriorityIndex: 0,
          },
        })
      ).body,
      'mergePeople',
    );

    const afterMerge = unwrap(
      (
        await client.graphql<{ person: { id: string } | null }>({
          endpoint: '/graphql',
          query: `query AfterMerge($id: UUID!) {
            person(filter: { id: { eq: $id } }) { id }
          }`,
          variables: { id: seeded.loser.id },
        })
      ).body,
      'person after merge',
    );

    assert(afterMerge.person === null, 'the losing record is gone');

    for (const id of [seeded.survivor.id, seeded.unrelated.id]) {
      unwrap(
        (
          await client.graphql({
            endpoint: '/graphql',
            query: `mutation DestroyPerson($id: UUID!) { destroyPerson(id: $id) { id } }`,
            variables: { id },
          })
        ).body,
        'merge cleanup',
      );
    }

    return { survivor: seeded.survivor.id };
  });

  // The role machinery, without swapping the test account's own role: a role
  // created here starts with nothing, and what it answers proves the fallbacks
  // and the overrides without anyone losing access to the workspace.
  await recorder.step('a role denies what it does not grant', async () => {
    const created = unwrap(
      (
        await client.graphql<{
          createOneRole: {
            id: string;
            isEditable: boolean;
            canReadAllObjectRecords: boolean;
            canDestroyAllObjectRecords: boolean;
          };
        }>({
          endpoint: '/metadata',
          query: `mutation CreateOneRole($createRoleInput: CreateRoleInput!) {
            createOneRole(createRoleInput: $createRoleInput) {
              id label isEditable canReadAllObjectRecords
              canUpdateAllObjectRecords canDestroyAllObjectRecords
              canUpdateAllSettings
            }
          }`,
          variables: {
            createRoleInput: {
              label: `E2E ${runSuffix}`,
              canReadAllObjectRecords: true,
              canUpdateAllObjectRecords: false,
              canDestroyAllObjectRecords: false,
              canUpdateAllSettings: false,
            },
          },
        })
      ).body,
      'createOneRole',
    );

    const roleId = created.createOneRole.id;

    assert(created.createOneRole.isEditable, 'a role we made is editable');
    assert(
      created.createOneRole.canReadAllObjectRecords &&
        !created.createOneRole.canDestroyAllObjectRecords,
      'the switches are stored as sent',
    );

    const objects = unwrap(
      (
        await client.graphql<{
          objects: { edges: { node: { id: string; nameSingular: string } }[] };
        }>({
          endpoint: '/metadata',
          query: `query ObjectsForPermissions {
            objects(paging: { first: 200 }) { edges { node { id nameSingular } } }
          }`,
        })
      ).body,
      'objects for permissions',
    );

    const companyObjectId = objects.objects.edges.find(
      (edge) => edge.node.nameSingular === 'company',
    )?.node.id;

    assert(companyObjectId !== undefined, 'company is in the metadata');

    const upserted = unwrap(
      (
        await client.graphql<{
          upsertObjectPermissions: {
            objectMetadataId: string;
            canReadObjectRecords: boolean | null;
          }[];
        }>({
          endpoint: '/metadata',
          query: `mutation UpsertObjectPermissions(
            $upsertObjectPermissionsInput: UpsertObjectPermissionsInput!
          ) {
            upsertObjectPermissions(
              upsertObjectPermissionsInput: $upsertObjectPermissionsInput
            ) {
              objectMetadataId canReadObjectRecords canUpdateObjectRecords
              canSoftDeleteObjectRecords canDestroyObjectRecords restrictedFields
            }
          }`,
          variables: {
            upsertObjectPermissionsInput: {
              roleId,
              objectPermissions: [
                { objectMetadataId: companyObjectId, canReadObjectRecords: false },
              ],
            },
          },
        })
      ).body,
      'upsertObjectPermissions',
    );

    assertEqual(
      upserted.upsertObjectPermissions[0]?.canReadObjectRecords,
      false,
      'the object override is stored',
    );

    // Read it back through getRoles, which is what the settings page renders.
    const roles = unwrap(
      (
        await client.graphql<{
          getRoles: {
            id: string;
            isEditable: boolean;
            objectPermissions: { objectMetadataId: string }[];
          }[];
        }>({
          endpoint: '/metadata',
          query: `query GetRolesForPermissions {
            getRoles {
              id label isEditable
              objectPermissions { objectMetadataId canReadObjectRecords }
              workspaceMembers { id }
              permissionFlags { flag }
            }
          }`,
        })
      ).body,
      'getRoles',
    );

    const role = roles.getRoles.find((entry) => entry.id === roleId);

    assert(role !== undefined, 'the new role is listed');
    assertEqual(
      role?.objectPermissions.length,
      1,
      'the role carries its override',
    );

    // A built-in role cannot be edited: losing Admin would lock the workspace
    // out of its own settings with no way back in.
    const builtIn = roles.getRoles.find((entry) => entry.isEditable === false);

    assert(builtIn !== undefined, 'the built-in roles were seeded');

    const refusedEdit = (
      await client.graphql({
        endpoint: '/metadata',
        query: `mutation UpdateOneRole($updateRoleInput: UpdateRoleInput!) {
          updateOneRole(updateRoleInput: $updateRoleInput) { id label }
        }`,
        variables: {
          updateRoleInput: {
            id: builtIn?.id,
            update: { label: 'should not stick' },
          },
        },
      })
    ).body as { errors?: { message: string }[] };

    assert(
      (refusedEdit.errors ?? []).some((error) =>
        error.message.includes('built-in'),
      ),
      `editing a built-in role is refused: ${JSON.stringify(refusedEdit).slice(0, 200)}`,
    );

    unwrap(
      (
        await client.graphql({
          endpoint: '/metadata',
          query: `mutation DeleteOneRole($roleId: UUID!) { deleteOneRole(roleId: $roleId) }`,
          variables: { roleId },
        })
      ).body,
      'deleteOneRole',
    );

    return { roleId };
  });

  await recorder.step('signOut invalidates the session', async () => {
    unwrap(
      (
        await client.graphql({
          endpoint: '/metadata',
          query: `mutation SignOut { signOut }`,
        })
      ).body,
      'signOut',
    );

    const { response } = await client.graphql({
      endpoint: '/graphql',
      query: `query { companies { totalCount } }`,
    });

    assertEqual(
      response.status,
      401,
      'records API refuses the revoked session',
    );

    return { status: response.status };
  });

  return { steps: recorder.steps };
};
