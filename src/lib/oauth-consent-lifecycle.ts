export type OAuthConsentGrant = {
  clientId: string;
  redirectUri: string;
  resource: string;
  state: string;
  scopes: string[];
  challenge: string;
};

export type OAuthConsentCompletion =
  | { decision: "deny"; consent: OAuthConsentGrant; code: null }
  | { decision: "allow"; consent: OAuthConsentGrant; code: string };

export class OAuthConsentLifecycleError extends Error {
  constructor() {
    super("Consent request expired or already used");
  }
}

export type OAuthConsentTransaction = {
  consume(
    ownerId: string,
    requestToken: string,
  ): Promise<OAuthConsentGrant | null>;
  issueAuthorizationCode(
    ownerId: string,
    consent: OAuthConsentGrant,
    requestId: string | null,
  ): Promise<string>;
  recordDenial(
    ownerId: string,
    consent: OAuthConsentGrant,
    requestId: string | null,
  ): Promise<void>;
};

export type OAuthConsentStore = {
  transaction<T>(
    operation: (transaction: OAuthConsentTransaction) => Promise<T>,
  ): Promise<T>;
};

export async function finalizeOAuthConsent(
  store: OAuthConsentStore,
  input: {
    ownerId: string;
    requestToken: string;
    decision: "allow" | "deny";
    requestId: string | null;
  },
): Promise<OAuthConsentCompletion> {
  return store.transaction(async (transaction) => {
    const consent = await transaction.consume(
      input.ownerId,
      input.requestToken,
    );
    if (!consent) throw new OAuthConsentLifecycleError();
    if (input.decision === "deny") {
      await transaction.recordDenial(
        input.ownerId,
        consent,
        input.requestId,
      );
      return { decision: "deny", consent, code: null };
    }
    const code = await transaction.issueAuthorizationCode(
      input.ownerId,
      consent,
      input.requestId,
    );
    return { decision: "allow", consent, code };
  });
}
