# 🔥 SaaS Stack Recommendation Engine -- Full Pipeline Spec

------------------------------------------------------------------------

# 1. Overview

This document defines the complete architecture for:

-   Survey → Spec normalization
-   Capability mapping
-   Stack generation
-   Plan scoring
-   Popularity bonus scoring
-   Product Hunt crawling
-   DB persistence (Supabase MCP)
-   Top 3 output with score breakdown

System is rule-based (no ML requirement).

------------------------------------------------------------------------

# 2. Core Architecture

Survey → FunctionalSpec → Capability → Stack → Plan Matching → Scoring →
Top 3

------------------------------------------------------------------------

# 3. Spec Taxonomy (Fixed Internal Standard)

Purpose: Convert messy user answers into a stable internal specification
model.

## 3.1 FunctionalSpec Categories

### A. Project Type

-   landing_page
-   ecommerce
-   saas
-   blog
-   internal_tool
-   marketplace
-   ai_app

### B. Business Model

-   freelance
-   agency
-   startup
-   enterprise
-   side_project

### C. Required Features (User Selected)

-   social_login
-   email_auth
-   payment
-   subscription
-   admin_dashboard
-   cms
-   file_upload
-   analytics
-   team_management
-   role_permission
-   api_access
-   realtime
-   edge_functions
-   background_jobs

### D. Non-Functional Requirements

-   expected_scale (small / medium / large)
-   region (us / asia / global)
-   security_level (basic / enhanced / enterprise)

------------------------------------------------------------------------

# 4. Capability Model

Capability is tool-agnostic atomic functionality.

Example Capability IDs:

AUTH_BASIC AUTH_SOCIAL PAYMENT_ONE_TIME PAYMENT_SUBSCRIPTION DB_HOSTED
STORAGE_OBJECT EDGE_FUNCTION SERVERLESS_FUNCTION REALTIME_DB CMS_BUILTIN
ANALYTICS_BASIC ANALYTICS_ADVANCED TEAM_COLLAB ROLE_BASED_ACCESS
API_PUBLIC CI_CD CUSTOM_DOMAIN SSL BACKGROUND_JOBS

------------------------------------------------------------------------

# 5. FunctionalSpec → Capability Mapping

Rule-based deterministic mapping.

Example:

IF feature == social_login → add AUTH_SOCIAL\
IF feature == payment → add PAYMENT_ONE_TIME\
IF feature == subscription → add PAYMENT_SUBSCRIPTION

IF project_type == ecommerce →\
- add PAYMENT_ONE_TIME\
- add DB_HOSTED\
- add STORAGE_OBJECT

IF expected_scale == large →\
- add SERVERLESS_FUNCTION\
- add EDGE_FUNCTION

------------------------------------------------------------------------

# 6. Tool Data Model

## Tool Table

tool_id (pk)\
name\
category\
website\
popularity_rank_percentile (0, 0.25, 0.5, 0.75, 1 — 전체 5구간)

## Plan Table

plan_id (pk)\
tool_id (fk)\
name\
monthly_price\
yearly_price\
is_free

## PlanCapability Table

plan_id (fk)\
capability_id (fk)\
limit_value (nullable)\
limit_unit (nullable)

------------------------------------------------------------------------

# 7. Stack Object

Stack is a runtime object.

Stack: - tools\[\] - plans\[\] - provided_capabilities\[\] -
total_cost - score

------------------------------------------------------------------------

# 8. Scoring Logic

## 8.1 Capability Match Score

coverage_ratio = provided / required\
capability_score = coverage_ratio \* 50

## 8.2 Cost Score

budget_ratio = total_cost / user_budget

-   30 if \<= 0.5\
-   20 if \<= 0.8\
-   10 if \<= 1.0\
-   0 if \> 1.0

## 8.3 Popularity Bonus

popularity_bonus = popularity_rank_percentile \* 20

If multiple tools: use average percentile.

## 8.4 Final Score

final_score =\
capability_score +\
cost_score +\
popularity_bonus

Max = 100

------------------------------------------------------------------------

# 9. Product Hunt Crawling Logic

Target:\
https://www.producthunt.com/categories/engineering-development?page=1&tags=developer+tools

## 9.1 Goal

Extract: - name - tagline - website - upvotes - ranking position

## 9.2 Crawling Strategy

Use Playwright (JS rendering required).

Steps:

1.  Load category page
2.  Wait for tool list selector
3.  Extract tool cards
4.  Visit individual tool page
5.  Extract:
    -   website URL
    -   description
    -   tags
    -   launch date

## 9.3 Popularity Score Calculation

전체 개수를 5구간으로 나누어 0, 0.25, 0.5, 0.75, 1 저장. 1등=1, 막등=0 (예: 10개면 1,2등=1, 9,10등=0).

quintile_index = (rank_one_based - 1) \* 5 // total_tools\
popularity_rank_percentile = (4 - quintile_index) / 4

Store in tool.popularity_rank_percentile

------------------------------------------------------------------------

# 10. Pricing Page Extraction Logic

For each tool:

1.  Attempt static fetch
2.  If incomplete → use Playwright
3.  Identify pricing table structure
4.  Extract:
    -   plan name
    -   monthly price
    -   yearly price
    -   feature list
    -   numeric limits
5.  Normalize feature text → Capability ID via rule mapping

Example:

"Unlimited Bandwidth" → capability = BANDWIDTH\
"1M Serverless Invocations" → capability = SERVERLESS_FUNCTION,
limit_value = 1000000

------------------------------------------------------------------------

# 11. DB Storage Flow (Supabase MCP)

After extraction:

1.  Insert Tool
2.  Insert Plans
3.  Insert PlanCapability rows

Flow:

crawl_tool() → normalize_data() → upsert_tool() → upsert_plans() →
upsert_plan_capabilities()

All writes via Supabase MCP.

------------------------------------------------------------------------

# 12. Recommendation Runtime Flow

1.  Receive Survey
2.  Convert → FunctionalSpec
3.  Map → Required Capability List
4.  Query DB for plans covering capabilities
5.  Generate all valid tool combinations (N allowed)
6.  Score each stack
7.  Sort descending
8.  Return Top 3

Return format:

\[ { stack: \["toolA_pro", "toolB_pro"\], total_cost: 40, score: 87,
breakdown: { capability_score: 48, cost_score: 20, popularity_bonus: 19
} }\]

------------------------------------------------------------------------

# 13. Future Extensions

-   Usage-based cost estimation module
-   LLM-assisted marketing feature normalization
-   Automated monthly re-crawl scheduler
-   Historical pricing change tracking
