// Retest rules for raw material (Ravi, 3 Oct 2026, FB-0061): after approval a
// raw-material batch is retested at most 3 times, each retest period at most
// 180 days (6 months), so a batch is covered for up to 18 months in all.
export const MAX_RM_RETEST_DAYS = 180;
export const MAX_RM_RETESTS = 3;
