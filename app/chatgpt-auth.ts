/** Retired legacy helper. Untrusted request identity headers cannot authenticate a store user.
 * All new customer/admin access uses server/auth.mjs and same-origin HttpOnly sessions.
 */
export type ChatGPTUser = {userId:string;displayName:string;email:string;fullName:string|null};
export async function getChatGPTUser():Promise<ChatGPTUser|null> { return null; }
