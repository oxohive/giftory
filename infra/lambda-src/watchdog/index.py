import boto3
import os
from datetime import datetime, timedelta, timezone

ECS_CLUSTER    = os.environ["ECS_CLUSTER"]
ECS_SERVICE    = os.environ["ECS_SERVICE"]
ALB_ARN_SUFFIX = os.environ["ALB_ARN_SUFFIX"]
TG_ARN_SUFFIX  = os.environ["TG_ARN_SUFFIX"]
IDLE_MINUTES   = int(os.environ.get("IDLE_MINUTES", "30"))

ecs = boto3.client("ecs")
cw  = boto3.client("cloudwatch")


def handler(event, context):
    # Check current desired count — nothing to do if already at 0
    resp    = ecs.describe_services(cluster=ECS_CLUSTER, services=[ECS_SERVICE])
    service = resp["services"][0]

    if service["desiredCount"] == 0:
        print("Service already at 0 — nothing to do")
        return {"scaled": False, "reason": "already_zero"}

    # Sum ALB RequestCount over the idle window
    now   = datetime.now(timezone.utc)
    start = now - timedelta(minutes=IDLE_MINUTES)

    stats = cw.get_metric_statistics(
        Namespace  = "AWS/ApplicationELB",
        MetricName = "RequestCount",
        Dimensions = [
            {"Name": "LoadBalancer", "Value": ALB_ARN_SUFFIX},
            {"Name": "TargetGroup",  "Value": TG_ARN_SUFFIX},
        ],
        StartTime  = start,
        EndTime    = now,
        Period     = IDLE_MINUTES * 60,
        Statistics = ["Sum"],
    )

    total = sum(d["Sum"] for d in stats.get("Datapoints", []))
    print(f"Requests in last {IDLE_MINUTES} min: {total}")

    if total == 0:
        print(f"No traffic for {IDLE_MINUTES} min — scaling to 0")
        ecs.update_service(cluster=ECS_CLUSTER, service=ECS_SERVICE, desiredCount=0)
        return {"scaled": True, "reason": "idle_timeout", "requests": total}

    print("Traffic detected — keeping service alive")
    return {"scaled": False, "reason": "active", "requests": total}
