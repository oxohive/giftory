import boto3
import os

ECS_CLUSTER = os.environ["ECS_CLUSTER"]
ECS_SERVICE = os.environ["ECS_SERVICE"]

ecs = boto3.client("ecs")

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


def handler(event, context):
    # Scale ECS up to 1 task
    resp = ecs.describe_services(cluster=ECS_CLUSTER, services=[ECS_SERVICE])
    service = resp["services"][0]

    if service["desiredCount"] == 0:
        print(f"Scaling {ECS_SERVICE} to 1")
        ecs.update_service(cluster=ECS_CLUSTER, service=ECS_SERVICE, desiredCount=1)
    else:
        print(f"Service already at desiredCount={service['desiredCount']}, skipping scale-up")

    # Return warming page (used when triggered via CloudWatch alarm → SNS → ALB,
    # or if wired as a direct ALB Lambda target group in the future)
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "text/html; charset=utf-8"},
        "body": WARMING_HTML,
    }
