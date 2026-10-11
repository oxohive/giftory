import boto3
import os

ECS_CLUSTER   = os.environ["ECS_CLUSTER"]
ECS_SERVICE   = os.environ["ECS_SERVICE"]
RULE_ARN      = os.environ["RULE_ARN"]
ECS_TG_ARN    = os.environ["ECS_TG_ARN"]
WAKEUP_TG_ARN = os.environ["WAKEUP_TG_ARN"]

ecs = boto3.client("ecs")
alb = boto3.client("elbv2")

WARMING_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="20">
  <title>Giftory — Waking up</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #0f0f11;
      color: #e4e4e7;
      padding: 1.5rem;
    }

    .wordmark {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: #fff;
      margin-bottom: 3rem;
    }
    .wordmark span { color: #a78bfa; }

    .card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 16px;
      padding: 2.5rem 2rem;
      text-align: center;
      max-width: 360px;
      width: 100%;
    }

    .ring {
      width: 48px; height: 48px;
      border: 3px solid #27272a;
      border-top-color: #a78bfa;
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
      margin: 0 auto 1.5rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    h1 {
      font-size: 1.125rem;
      font-weight: 600;
      color: #fafafa;
      margin-bottom: 0.5rem;
    }

    p {
      font-size: 0.875rem;
      color: #71717a;
      line-height: 1.6;
    }

    .progress {
      margin-top: 1.75rem;
      height: 3px;
      border-radius: 99px;
      background: #27272a;
      overflow: hidden;
    }
    .progress-bar {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #7c3aed, #a78bfa);
      border-radius: 99px;
      animation: fill 20s linear forwards;
    }
    @keyframes fill { to { width: 95%; } }

    .status {
      margin-top: 1rem;
      font-size: 0.75rem;
      color: #52525b;
    }
  </style>
</head>
<body>
  <div class="wordmark">Gift<span>ory</span></div>

  <div class="card">
    <div class="ring"></div>
    <h1>Service is waking up</h1>
    <p>The server was idle and is starting back up.<br>This page refreshes automatically.</p>
    <div class="progress"><div class="progress-bar"></div></div>
    <p class="status">Ready in about 30 seconds &mdash; no action needed</p>
  </div>
</body>
</html>"""


def is_ecs_healthy():
    """Return True if ECS has at least one running task.

    ALB reports targets as 'unused' (not 'healthy') while the listener points
    to the Lambda TG, so checking ALB target health always returns False here.
    ECS runningCount is the correct signal.
    """
    resp = ecs.describe_services(cluster=ECS_CLUSTER, services=[ECS_SERVICE])
    service = resp["services"][0]
    return service["runningCount"] >= 1


def switch_rule(tg_arn):
    alb.modify_rule(
        RuleArn=RULE_ARN,
        Actions=[{"Type": "forward", "TargetGroupArn": tg_arn}],
    )


def handler(event, context):
    # Scale ECS to 1 if it is sleeping
    resp = ecs.describe_services(cluster=ECS_CLUSTER, services=[ECS_SERVICE])
    service = resp["services"][0]

    if service["desiredCount"] == 0:
        print(f"Scaling {ECS_SERVICE} to 1")
        ecs.update_service(cluster=ECS_CLUSTER, service=ECS_SERVICE, desiredCount=1)
    else:
        print(f"Service desiredCount={service['desiredCount']} — no scale-up needed")

    # If invoked from ALB: check whether ECS is healthy yet
    from_alb = "requestContext" in event and "elb" in event.get("requestContext", {})

    if from_alb and is_ecs_healthy():
        print("ECS is healthy — switching ALB rule to ECS TG")
        switch_rule(ECS_TG_ARN)

        # Don't 302 immediately: ALB takes ~2s to propagate the rule change to all
        # nodes. An instant redirect races the propagation and causes a redirect loop.
        # Instead, serve a fast-refresh page — by the time the browser reloads (3s)
        # the rule switch has fully propagated and the next request lands on ECS.
        headers = event.get("headers") or {}
        host    = headers.get("host", "")
        path    = event.get("path", "/")
        qs      = event.get("queryStringParameters") or {}
        qs_str  = "?" + "&".join(f"{k}={v}" for k, v in qs.items()) if qs else ""
        target  = f"https://{host}{path}{qs_str}"

        fast_refresh = WARMING_HTML.replace(
            'content="20"',
            f'content="3;url={target}"',
        )
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "text/html; charset=utf-8"},
            "body": fast_refresh,
        }

    # ECS not healthy yet (or triggered by CloudWatch) — show warming page
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "text/html; charset=utf-8"},
        "body": WARMING_HTML,
    }
