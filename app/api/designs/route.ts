// Legacy header-trusting storage is intentionally retired. Browser-local designs
// remain recoverable via /customize?storage=local. Authenticated storage uses the
// Node API behind the same-origin /api/store reverse proxy, never identity headers.
export const dynamic = 'force-dynamic';
const retired = () => Response.json({error:'请使用新版手机号登录及设计保存接口。旧版本机设计仍可导出。'}, {status:410,headers:{'Cache-Control':'no-store'}});
export const GET = retired;
export const POST = retired;
