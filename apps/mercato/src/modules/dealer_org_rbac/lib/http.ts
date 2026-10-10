// Re-export the shared HTTP utilities from dealer_onboarding.
// The handler wrapper is module-agnostic; errors are logged under the calling component name.
export {
  dealerHandler,
  readParam,
  readJsonBody,
  parseOrThrow,
  errorResponse,
  DealerApiError,
  type DealerHandlerArgs,
  type Translate,
  type RouteContext,
} from '../../dealer_onboarding/lib/http'
