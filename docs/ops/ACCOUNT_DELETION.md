# Account deletion requests

The owner can initiate deletion inside Settings → Delete my account, reauthenticate
with their current password, and receive a durable reference and request date.
This covers the signed-in account and all its establishments, not an operator-view
merchant. Submitting the request does not immediately erase records.

## Operator procedure

1. Check the global support queue for urgent `account-deletion` tickets. Their empty
   merchant is intentional: they belong to an account, never to a paired till.
   `diagnostics.account_id` is derived from the authenticated owner on the server.
2. Acknowledge the reference to the ticket's server-recorded contact address. Do not
   ask the user to initiate a second request by email. Complete within the disclosed
   30-day period; give a specific date if processing requires additional coordination.
3. Verify the exact account and its owned establishments. Explain which records, if
   any, must be retained by law and why. Do not erase a different owner's data or
   silently treat suspension, unpairing, or ticket closure as account deletion.
4. After the owner has had the opportunity to export, use the existing authorized
   store-closure process for every owned establishment. It purges private objects
   before their registries. Deleting the last store removes the account and its
   account-deletion ticket/messages; earlier store closures preserve the request.
5. Accounts with no establishment require an authorized operator's account-level
   cleanup: the store-closure API cannot handle them. Inspect all linked records and
   sessions first; do not improvise a broad DELETE or describe this case as automated.
6. Verify account access is revoked and associated data is deleted or lawfully
   retained. Send completion confirmation to the owner only after that verification.
   Keep the contact temporarily in the operator workflow, never in a source file or
   terminal log. Do not mark a support request resolved merely because it was received.

Retries reuse one ticket and one request message. Errors must not display a success
receipt. No migration is needed: this uses existing support tables. Missing tables
fail closed with 503 and leave the account untouched.

## Release checks

Run `node tools/account-deletion-test.mjs` and
`node tools/admin-delete-r2-test.mjs`. In a positively identified review demo account,
verify the in-app confirmation UI and receipt separately from any destructive closure.
Never submit deletion requests or perform closure tests on a live merchant.
