export class ApiClient {
  readonly baseUrl: string;
  readonly apiKey: string;
  private accessToken?: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  async graphql<T>(
    query: string,
    variables: Record<string, unknown>,
    authToken?: string
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Pragma: 'crcm-x-authorized',
    };
    if (this.accessToken) {
      headers['Authorization'] = this.accessToken;
    }

    const res = await fetch(`${this.baseUrl}/api/graphql`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });

    const json = await res.json();
    if (json.errors) {
      throw new Error(JSON.stringify(json.errors));
    }
    return json.data as T;
  }

  async restPost(
    path: string,
    authToken: string,
    body: Record<string, string> | object,
    contentType: 'json' | 'form' = 'form'
  ): Promise<any> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Care.com-APIKey': this.apiKey,
      'X-Care.com-AuthToken': authToken,
    };

    let bodyStr: string;
    if (contentType === 'form') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      bodyStr = new URLSearchParams(body as Record<string, string>).toString();
    } else {
      headers['Content-Type'] = 'application/json';
      bodyStr = JSON.stringify(body);
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: bodyStr,
    });

    return res.json();
  }

  async restGet(
    path: string,
    authToken: string,
    extraHeaders?: Record<string, string>
  ): Promise<any> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Care.com-APIKey': this.apiKey,
      'X-Care.com-AuthToken': authToken,
      ...extraHeaders,
    };

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers,
    });

    return res.json();
  }

  async retryRequest<T>(
    fn: () => Promise<T>,
    attempts: number,
    operationName: string
  ): Promise<T> {
    let lastError: Error | null = null;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        console.warn(
          `${operationName} attempt ${i + 1}/${attempts} failed: ${lastError.message}`
        );
      }
    }
    throw lastError;
  }
}
