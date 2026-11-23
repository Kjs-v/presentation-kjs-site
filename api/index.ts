/**
 * The one Vercel Function for the whole API. All routing happens in server/router.ts.
 * (The free Vercel plan allows at most 12 functions, so every endpoint shares this one.)
 */
import { handle } from '../server/router.js';

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const HEAD = handle;
