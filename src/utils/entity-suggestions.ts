import type { EntitySuggestionsResult, SuggestionProviderHints } from "../types/websocket";

export interface SuggestionProviderInfo {
  id: string;
  // undefined if the backend lists suggestions of a provider without reporting hints for it
  hints?: SuggestionProviderHints;
  // number of suggestions originating from this provider
  count: number;
}

/**
 * Every provider the backend knows about, in the order it reports them -
 * whether it has suggestions or not, and whether this panel knows it or not.
 */
export const suggestionProviders = (result: EntitySuggestionsResult): SuggestionProviderInfo[] => {
  const providers = new Map<string, SuggestionProviderInfo>();
  Object.entries(result.providers).forEach(([id, hints]) => {
    providers.set(id, { id, hints, count: 0 });
  });
  result.suggestions.forEach((suggestion) => {
    const provider = providers.get(suggestion.source) ?? { id: suggestion.source, count: 0 };
    provider.count += 1;
    providers.set(suggestion.source, provider);
  });
  return [...providers.values()];
};
