import helloasso from 'helloasso-node';
import { ClientCredentials } from 'simple-oauth2';

const API_BASE_URL = 'https://api.helloasso.com';
const CLIENT_ID = process.env.HELLOASSO_CLIENT_ID;
const CLIENT_SECRET = process.env.HELLOASSO_CLIENT_SECRET;
const ORGANIZATION_SLUG = process.env.HELLOASSO_ORGANIZATION_SLUG;

const oAuthClient = new ClientCredentials({
  client: {
    id: CLIENT_ID,
    secret: CLIENT_SECRET,
  },
  auth: {
    tokenHost: API_BASE_URL,
    tokenPath: '/oauth2/token',
  },
  options: {
    // HelloAsso expects credentials in the request body, not as Basic Auth header
    authorizationMethod: 'body',
  },
});

let accessToken;
const getAccessToken = async () => {
  if (accessToken) {
    return accessToken;
  }

  const token = await oAuthClient.getToken();
  accessToken = token.token.access_token;
  return accessToken;
};

export const getLastMembershipOrders = async (from) => {
  const defaultClient = helloasso.ApiClient.instance;

  const OAuth2 = defaultClient.authentications['OAuth2'];
  OAuth2.accessToken = await getAccessToken();

  const apiInstance = new helloasso.CommandesApi();
  return new Promise((resolve, reject) => {
    apiInstance.organizationsOrganizationSlugOrdersGet(
      ORGANIZATION_SLUG,
      { from: from.toISOString(), formTypes: ['Membership'], pageSize: 100 },
      (error, data, response) => {
        if (error) {
          console.error('Error getting orders:', error);
          reject(error);
        } else {
          resolve((data ?? response.body)?.data ?? []);
        }
      }
    );
  });
};

export const getOrganizationDetails = async () => {
  const defaultClient = helloasso.ApiClient.instance;

  const OAuth2 = defaultClient.authentications['OAuth2'];
  OAuth2.accessToken = await getAccessToken();

  const apiInstance = new helloasso.OrganisationApi();
  return new Promise((resolve, reject) => {
    apiInstance.organizationsOrganizationSlugGet(ORGANIZATION_SLUG, (error, data, response) => {
      if (error) {
        console.error('Error getting organization details:', error);
        reject(error);
      } else {
        resolve(data ?? response.body);
      }
    });
  });
};
