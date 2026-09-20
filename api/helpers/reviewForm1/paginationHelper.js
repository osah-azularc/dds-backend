/*
  Created by  : Snehal Narkar
  Date        : 2026-07-15
  Description : Shared limit/offset parsing for the Review Form 1s list
                endpoints — clamps client-supplied limit to a sane upper bound
                so a caller can't force a full-table scan (e.g. limit=999999).
*/

export const MAX_PAGE_SIZE = 200;

/**
 * Parses client-supplied limit/offset, falling back to defaultLimit/0 on
 * garbage input and clamping limit to MAX_PAGE_SIZE regardless of what the
 * client requests.
 */
export function parsePagination(limit, offset, defaultLimit = 50) {
  const parsedLimit = Number.parseInt(limit, 10);
  const parsedOffset = Number.parseInt(offset, 10);

  return {
    limit: Number.isNaN(parsedLimit) ? defaultLimit : Math.min(Math.max(parsedLimit, 1), MAX_PAGE_SIZE),
    offset: Number.isNaN(parsedOffset) || parsedOffset < 0 ? 0 : parsedOffset,
  };
}
