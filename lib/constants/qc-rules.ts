// Retest rules (Ravi, 3 Oct 2026, FB-0061; finished product follows the same cycle since
// 12 Oct 2026, SCAN-P4-04): after approval a batch is retested at most 3 times, each retest period at most
// 180 days (6 months), so a batch is covered for up to 18 months in all.
export const MAX_RM_RETEST_DAYS = 180;
export const MAX_RM_RETESTS = 3;
