export type AccountBoundCredential = {
  accountId: string;
  token: string;
};

export function canSendAccountOperation(
  operationAccountId: string,
  activeAccountId: string,
  credential: AccountBoundCredential | null,
): credential is AccountBoundCredential {
  return (
    operationAccountId === activeAccountId
    && credential !== null
    && credential.accountId === activeAccountId
    && credential.token.length > 0
  );
}

export function bindVerifiedCredential(
  expectedAccountId: string,
  token: string,
  verifiedUserId: string | null | undefined,
): AccountBoundCredential | null {
  return token.length > 0 && verifiedUserId === expectedAccountId
    ? { accountId: expectedAccountId, token }
    : null;
}
