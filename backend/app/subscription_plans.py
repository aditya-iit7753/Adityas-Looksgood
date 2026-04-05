ALLOWED_PLANS = {"free", "pro", "creator"}

# Treat these as per-period (monthly) quotas.
PLAN_LIMITS = {
    "free": {"ai_generations_remaining": 2, "video_exports_remaining": 1},
    "pro": {"ai_generations_remaining": 60, "video_exports_remaining": 25},
    "creator": {"ai_generations_remaining": 200, "video_exports_remaining": 100},
}

