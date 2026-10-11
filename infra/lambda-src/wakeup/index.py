import boto3
import os

ECS_CLUSTER   = os.environ["ECS_CLUSTER"]
ECS_SERVICE   = os.environ["ECS_SERVICE"]
LISTENER_ARN  = os.environ["LISTENER_ARN"]
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
  <title>Giftory — Starting</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; background: #fafafa; color: #333;
    }
    .card {
      text-align: center; padding: 3rem 2rem;
      background: #fff; border-radius: 12px;
      box-shadow: 0 2px 16px rgba(0,0,0,0.08);
      max-width: 380px; width: 90%;
    }
    .spinner {
      width: 40px; height: 40px; border: 3px solid #e5e7eb;
      border-top-color: #6366f1; border-radius: 50%;
      animation: spin 0.8s linear infinite; margin: 0 auto 1.5rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; }
    p  { font-size: 0.9rem; color: #6b7280; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h1>Starting up…</h1>
    <p>The service was sleeping. It will be ready in about 30 seconds.<br>This page refreshes automatically.</p>
  </div>
</body>
</html>"""


def is_ecs_healthy():
    """Return True if at least one ECS target in the ALB target group is healthy."""
    resp = alb.describe_target_health(TargetGroupArn=ECS_TG_ARN)
    return any(
        t["TargetHealth"]["State"] == "healthy"
        for t in resp["TargetHealthDescriptions"]
    )


def switch_listener(tg_arn):
    alb.modify_listener(
        ListenerArn=LISTENER_ARN,
        DefaultActions=[{"Type": "forward", "TargetGroupArn": tg_arn}],
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
        print("ECS is healthy — switching ALB listener to ECS TG")
        switch_listener(ECS_TG_ARN)

        # Redirect to the original path so the next request hits ECS directly
        headers = event.get("headers") or {}
        host    = headers.get("host", "")
        path    = event.get("path", "/")
        qs      = event.get("queryStringParameters") or {}
        qs_str  = "?" + "&".join(f"{k}={v}" for k, v in qs.items()) if qs else ""

        return {
            "statusCode": 302,
            "headers": {"Location": f"http://{host}{path}{qs_str}"},
            "body": "",
        }

    # ECS not healthy yet (or triggered by CloudWatch) — show warming page
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "text/html; charset=utf-8"},
        "body": WARMING_HTML,
    }
