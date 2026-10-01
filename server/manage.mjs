/** Operator-only local CLI; never imported by the browser or exposed as HTTP.
 * Do not run promotion until the merchant separately authorizes the role grant.
 */
import {createStore} from './domain.mjs';
import {loadConfig} from './http.mjs';
const action=process.argv[2];
if(action!=='promote-admin'||!process.argv.includes('--confirm-role-change')) {
  process.stdout.write('Operator action: promote-admin --confirm-role-change\nRequires STORE_ADMIN_PHONE for an existing OTP-verified account, plus private API configuration.\nThis command grants privileged merchant access. Run only after explicit operator authorization.\n');
} else {
  let store;
  try {
    const config=loadConfig(process.env);
    if(!process.env.STORE_ADMIN_PHONE)throw new Error('Admin account not specified');
    store=createStore({filename:config.filename});
    const account=store.findUserByPhone(process.env.STORE_ADMIN_PHONE);
    if(!account)throw new Error('The account must complete OTP verification first');
    const promoted=store.bootstrapAdmin({phone:process.env.STORE_ADMIN_PHONE});
    process.stdout.write(`Merchant role granted to verified account ${promoted.id}. Audit record created.\n`);
  } catch(error) {
    // Do not echo phone numbers, secrets, or database contents.
    process.stderr.write(`Role grant refused: ${error instanceof Error&&error.message==='The account must complete OTP verification first'?error.message:'check authorized account and private server configuration'}.\n`);
    process.exitCode=1;
  } finally {store?.close();}
}
