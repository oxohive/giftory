# Giftory — AWS Dev Deployment Plan

**Account:** 767398004313  
**Region:** `ap-south-1` (Mumbai) — co-located with Supabase DB  
**Goal:** Lowest-cost dev environment, scale-to-zero after 30 min idle

---

## Architecture

```
Internet
  │
  ├── Storefront (Next.js) ──► Vercel (free)
  │                              └── calls Mercato API via ALB
  │
  └── ALB  (ap-south-1)
        │
        ├── ECS Fargate Spot ──► Mercato backend (port 3000)
        │   (0 – 1 tasks)          └── Supabase PostgreSQL (already live)
        │
        └── Lambda "wakeup"  ◄── ALB fallback when ECS is at 0 tasks
              └── sets ECS desired=1, returns "Starting…" page
```

**Why two apps:**
- Storefront is plain Next.js → Vercel hosts it for free, zero ops.
- Mercato uses `isolated-vm` (native binary), BullMQ workers, DB connection pool → must be a real container, not a serverless function.

---

## Scale-to-Zero

### Cold start (scale UP)
1. Request hits ALB → no healthy ECS targets → ALB routes to **Lambda wakeup**.
2. Lambda sets ECS desired count = 1, returns HTTP 200 "Service starting, refresh in 30 s".
3. ECS starts Fargate Spot task (~30–60 s). ALB health check passes.
4. ALB switches routing to ECS. All subsequent requests hit the live container.

### Idle shutdown (scale DOWN)
1. **EventBridge** triggers **Lambda watchdog** every 5 minutes.
2. Watchdog reads `RequestCount` from CloudWatch (ALB metric, last 30 min).
3. If count = 0 for ≥ 30 min → watchdog sets ECS desired count = 0.
4. Running task drains (30 s connection drain) then stops. Billing stops.

---

## Monthly Cost — Dev

> Assumptions: active 8 h/day × 22 working days = **176 h active**, 376 h idle.

| Service | What it does | Cost |
|---|---|---|
| **ALB** | Routes traffic, health checks | **$5.84** |
| ALB LCU (dev traffic) | ~2 LCU-h/month | $0.02 |
| ECS Fargate Spot — 0.5 vCPU | 176 h × $0.0152/vCPU-h × 0.5 | $1.34 |
| ECS Fargate Spot — 1 GB RAM | 176 h × $0.00166/GB-h | $0.29 |
| Lambda (wakeup + watchdog) | ~5 000 invocations/month | Free tier |
| EventBridge Scheduler | ~8 700 invocations/month | Free tier |
| ECR storage | < 1 GB | Free (500 GB free) |
| CodeBuild | 100 min/month free; ~$0–2 after | $0–2 |
| SSM Parameter Store | Stores secrets as SecureString | **Free** |
| CloudWatch (2 alarms) | Idle-detection metric | $0.20 |
| Data transfer out (~1 GB) | $0.109/GB | $0.11 |
| Vercel (storefront) | Hosting + CDN | Free |
| **Total** | | **~$7.80 – $9.80/mo** |

> **Biggest fixed cost:** ALB at $5.84/month (62% of total). It runs 24/7 regardless of traffic.  
> **Secrets:** Using SSM Parameter Store (free) instead of Secrets Manager ($0.40/secret/month).  
> **Future option:** Replace ALB with API Gateway HTTP API to cut the fixed cost to ~$1/month — more complex, worth it only if this stays dev for 6+ months.

---

## Services

| Service | Purpose |
|---|---|
| ECR | Container image registry |
| ECS Fargate Spot | Runs Mercato container (0–1 tasks) |
| ALB | Traffic routing + health checks |
| Application Auto Scaling | Min 0, Max 1 tasks |
| Lambda — wakeup | Wakes ECS from 0 on first request |
| Lambda — watchdog | Scales to 0 after 30 min idle |
| EventBridge Scheduler | Triggers watchdog every 5 min |
| CloudWatch | ALB request-count metric + alarm |
| SSM Parameter Store | Encrypted secrets (SecureString) injected into ECS |
| CodeBuild | CI/CD — test → build image → push ECR → deploy ECS |
| GitHub (webhook) | Triggers CodeBuild on push to `main` |
| Vercel | Storefront hosting (free tier) |

---

## Secrets (SSM Parameter Store)

Stored as `SecureString` under `/giftory/dev/`:

| Parameter | Description |
|---|---|
| `/giftory/dev/DATABASE_URL` | Supabase connection string |
| `/giftory/dev/JWT_SECRET` | JWT signing secret |
| `/giftory/dev/AUTH_SECRET` | Auth session secret |
| `/giftory/dev/TENANT_DATA_ENCRYPTION_FALLBACK_KEY` | Tenant data encryption key |
| `/giftory/dev/RAZORPAY_KEY_ID` | `rzp_test_TmHUYAsZt3PspD` |
| `/giftory/dev/RAZORPAY_KEY_SECRET` | Razorpay key secret |
| `/giftory/dev/RAZORPAY_WEBHOOK_SECRET` | Webhook validation secret |

ECS task definition references these as `valueFrom` → injected as environment variables at task start. No code changes needed.

---

## Deployment Steps

```
Step 1   ✅  Create ECR repository (giftory-mercato)
Step 2   🔄  Build Docker image (apps/mercato) — in progress
Step 3        Push image to ECR
Step 4        Create ECS Cluster (giftory-dev, Fargate)
Step 5        Put secrets into SSM Parameter Store
Step 6        Create IAM task execution role (read SSM + ECR pull)
Step 7        Create ECS Task Definition (0.5 vCPU, 1 GB, Fargate Spot, SSM secrets)
Step 8        Create VPC / Security Groups (default VPC is fine for dev)
Step 9        Create ALB + two Target Groups (ECS target group + Lambda target group)
Step 10       Create ECS Service (desired=1, min=0, max=1)
Step 11       Create Lambda wakeup function
Step 12       Create Lambda watchdog function
Step 13       Create EventBridge rule (every 5 min → watchdog)
Step 14       Test scale-up: hit ALB, verify cold start
Step 15       Test scale-down: 30 min idle, verify task stops
Step 16  ⏳  CI/CD: Create IAM role for CodeBuild (blocked — needs permission grant)
Step 17       CI/CD: Create CodeBuild project
Step 18       CI/CD: Connect GitHub + create webhook (push to main → auto-deploy)
Step 19       Deploy storefront to Vercel (connect GitHub repo, set NEXT_PUBLIC_API_BASE_URL)
```

---

## Open Questions

| # | Question | Default |
|---|---|---|
| 1 | Custom domain (`api.giftory.in`) or use ALB DNS for dev? | ALB DNS for now; add ACM cert later |
| 2 | Fargate Spot can be interrupted — OK for dev? | Yes; use on-demand for prod |
| 3 | Redis for BullMQ in prod? | Not needed for dev (in-memory queue) |
| 4 | Razorpay webhook URL — point to ALB? | Yes, once ALB DNS is known |
