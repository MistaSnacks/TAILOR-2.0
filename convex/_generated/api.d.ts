/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as canonicalize from "../canonicalize.js";
import type * as documents from "../documents.js";
import type * as fittings from "../fittings.js";
import type * as generate from "../generate.js";
import type * as llm_anthropic from "../llm/anthropic.js";
import type * as llm_gemini from "../llm/gemini.js";
import type * as llm_index from "../llm/index.js";
import type * as llm_types from "../llm/types.js";
import type * as parse from "../parse.js";
import type * as parsing_extractText from "../parsing/extractText.js";
import type * as profile from "../profile.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  canonicalize: typeof canonicalize;
  documents: typeof documents;
  fittings: typeof fittings;
  generate: typeof generate;
  "llm/anthropic": typeof llm_anthropic;
  "llm/gemini": typeof llm_gemini;
  "llm/index": typeof llm_index;
  "llm/types": typeof llm_types;
  parse: typeof parse;
  "parsing/extractText": typeof parsing_extractText;
  profile: typeof profile;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
