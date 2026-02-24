--tools 
--툴 기본 정보
create table tools (
  id uuid primary key default gen_random_uuid(), -- 툴 고유 ID (UUID)
  name text not null, -- 툴 이름 (예: "Vercel", "Framer")
  slug text unique not null, -- URL 친화적 식별자 (예: "vercel", "framer")
  category text, -- 툴 카테고리 (예: "frontend_hosting", "database", "auth", "payment", "monitoring")
  website text, -- 툴 공식 웹사이트 URL
  description text, -- 툴 설명/소개
  popularity_rank_percentile numeric default 0, -- 인기도 순위 백분위 (0~100, Product Hunt 기준)
  created_at timestamptz default now() -- 생성 시각
);

--plans
--툴의 플랜
create table plans (
  id uuid primary key default gen_random_uuid(), -- 플랜 고유 ID (UUID)
  tool_id uuid references tools(id) on delete cascade, -- 소속 툴 ID (외래키)
  name text not null, -- 플랜 이름 (예: "Free", "Pro", "Team")
  slug text not null, -- 플랜 식별자 (예: "vercel_pro", "framer_free")
  monthly_price numeric not null, -- 월간 가격 (USD, 0일 수 있음)
  yearly_price numeric, -- 연간 가격 (USD, nullable)
  is_free boolean default false, -- 무료 플랜 여부
  created_at timestamptz default now(), -- 생성 시각
  unique(tool_id, slug) -- 같은 툴 내에서 slug는 유일해야 함
);

--capabilities
--Capability 마스터 테이블 
create table capabilities (
  id text primary key, -- Capability 식별자 (예: "AUTH_SOCIAL", "PAYMENT_ONE_TIME", "DB_HOSTED")
  category text, -- Capability 카테고리 (예: "auth", "payment", "compute", "storage")
  description text -- Capability 설명
);

--plan_capabilities
--플랜이 제공하는 capability
create table plan_capabilities (
  id uuid primary key default gen_random_uuid(), -- 레코드 고유 ID (UUID)
  plan_id uuid references plans(id) on delete cascade, -- 플랜 ID (외래키)
  capability_id text references capabilities(id), -- Capability ID (외래키)
  limit_value numeric, -- 제한값 (예: 1000000, null이면 무제한)
  limit_unit text, -- 제한 단위 (예: "invocations", "gb", "users", "requests")
  unique(plan_id, capability_id) -- 같은 플랜에서 같은 capability는 중복 불가
);

--Capability 개수 계산 view
create view plan_capability_count as
select
  p.id as plan_id, -- 플랜 ID
  count(pc.capability_id) as capability_count -- 해당 플랜이 제공하는 capability 개수
from plans p
left join plan_capabilities pc on p.id = pc.plan_id
group by p.id;  