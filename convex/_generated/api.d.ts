/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from '../crons.js';
import type * as emails from '../emails.js';
import type * as http from '../http.js';
import type * as init from '../init.js';
import type * as lib_approvers from '../lib/approvers.js';
import type * as lib_customer_view from '../lib/customer_view.js';
import type * as lib_delivery from '../lib/delivery.js';
import type * as lib_inbox_seen from '../lib/inbox_seen.js';
import type * as lib_outcome from '../lib/outcome.js';
import type * as lib_poller_health from '../lib/poller_health.js';
import type * as lib_pricing from '../lib/pricing.js';
import type * as lib_reply_verdict from '../lib/reply_verdict.js';
import type * as lib_request_id from '../lib/request_id.js';
import type * as lib_totals from '../lib/totals.js';
import type * as poller from '../poller.js';
import type * as quotes from '../quotes.js';
import type * as users from '../users.js';

import type { ApiFromModules, FilterApi, FunctionReference } from 'convex/server';

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  emails: typeof emails;
  http: typeof http;
  init: typeof init;
  'lib/approvers': typeof lib_approvers;
  'lib/customer_view': typeof lib_customer_view;
  'lib/delivery': typeof lib_delivery;
  'lib/inbox_seen': typeof lib_inbox_seen;
  'lib/outcome': typeof lib_outcome;
  'lib/poller_health': typeof lib_poller_health;
  'lib/pricing': typeof lib_pricing;
  'lib/reply_verdict': typeof lib_reply_verdict;
  'lib/request_id': typeof lib_request_id;
  'lib/totals': typeof lib_totals;
  poller: typeof poller;
  quotes: typeof quotes;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, 'public'>>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, 'internal'>>;

export declare const components: {};
