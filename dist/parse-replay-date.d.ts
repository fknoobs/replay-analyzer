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
export declare const parseReplayDate: (raw: string) => string;
