import { logger } from './logger';

/**
 * Wraps window.fetch so every HTTP call made by the app (token, userinfo, discovery) is logged with its
 * full request and response, including error bodies.
 */
const headersToObject = (headers) => {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return { ...headers };
};

const parseBody = (body) => {
  if (body == null) return undefined;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      const params = new URLSearchParams(body);
      const obj = Object.fromEntries(params.entries());
      return Object.keys(obj).length ? obj : body;
    }
  }
  if (body instanceof URLSearchParams) return Object.fromEntries(body.entries());
  return String(body);
};

let counter = 0;

export const installFetchLogger = () => {
  if (window.__moFetchLoggerInstalled) return;
  window.__moFetchLoggerInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const id = ++counter;
    const url = typeof input === 'string' ? input : input.url;
    const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const step = `HTTP #${id}`;

    logger.info(step, `→ ${method} ${url}`, {
      url,
      method,
      headers: headersToObject(init.headers || (input instanceof Request ? input.headers : undefined)),
      body: parseBody(init.body),
      rawBody: typeof init.body === 'string' ? init.body : undefined,
    });

    const started = performance.now();
    let response;
    try {
      response = await originalFetch(input, init);
    } catch (err) {
      if (err.name === 'AbortError') {
        logger.warn(step, `⊘ ${method} ${url} cancelled after ${Math.round(performance.now() - started)} ms`);
        throw err;
      }
      logger.error(step, `✗ ${method} ${url} failed after ${Math.round(performance.now() - started)} ms`, {
        error: err.message,
        hint:
          'A network/TypeError here usually means CORS: the server did not allow this origin ' +
          '(check the browser Network tab), or the URL is wrong.',
      });
      throw err;
    }

    const elapsed = Math.round(performance.now() - started);
    let body;
    try {
      const text = await response.clone().text();
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    } catch (err) {
      body = `<could not read body: ${err.message}>`;
    }

    logger[response.ok ? 'info' : 'error'](
      step,
      `← ${response.status} ${response.statusText} ${method} ${url} (${elapsed} ms)`,
      {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body,
      }
    );

    return response;
  };

  logger.info('init', 'fetch logger installed');
};
