/**
 * Parse Company of Heroes replay header date strings.
 *
 * Replays store the recorder's local Windows short-date + short-time (`g`),
 * so formats vary by culture. This parser targets Gregorian Windows locales
 * worldwide; non-Gregorian calendars (Hijri, Persian) fall back to the raw
 * string. Thai Buddhist years (>= 2400) are converted to Gregorian.
 *
 * Returns timezone-naive ISO local datetime `YYYY-MM-DDTHH:mm:ss`.
 */
/**
 * Parses a Company of Heroes replay header date string into a timezone-naive
 * ISO local datetime `YYYY-MM-DDTHH:mm:ss`.
 *
 * Replays store the recorder's local Windows short-date + short-time (`g`),
 * so formats vary by culture. This targets Gregorian Windows locales worldwide
 * (DMY / MDY / YMD, CJK meridiems, Thai Buddhist years ≥ 2400 → Gregorian).
 * Non-Gregorian calendars (Hijri, Persian) fall back to the raw string.
 * Ambiguous day/month pairs with `/` + AM/PM prefer MDY (en-US); note en-AU
 * DMY + AM/PM can still be ambiguous when both parts are ≤ 12.
 *
 * Used automatically by the header parser; export for custom tooling.
 *
 * @param raw - Date string as stored in the replay preamble (UTF-16 decoded).
 * @returns Normalized `YYYY-MM-DDTHH:mm:ss`, or the original string when
 *   unrecognized / non-Gregorian.
 *
 * @example
 * parseReplayDate("26/07/2026 19:47"); // "2026-07-26T19:47:00"
 * parseReplayDate("11/12/2025 16:26"); // "2025-12-11T16:26:00" (DMY)
 */
export declare const parseReplayDate: (raw: string) => string;
