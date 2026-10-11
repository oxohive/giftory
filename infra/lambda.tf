data "archive_file" "wakeup" {
  type        = "zip"
  source_file = "${path.module}/lambda-src/wakeup/index.py"
  output_path = "${path.module}/.build/wakeup.zip"
}

data "archive_file" "watchdog" {
  type        = "zip"
  source_file = "${path.module}/lambda-src/watchdog/index.py"
  output_path = "${path.module}/.build/watchdog.zip"
}

# ─── Wakeup Lambda ────────────────────────────────────────────────────────────
# Triggered by CloudWatch alarm when ECS HealthyHostCount = 0.
# Sets ECS desired_count = 1 so the container starts.

resource "aws_lambda_function" "wakeup" {
  function_name    = "${var.app_name}-wakeup"
  role             = aws_iam_role.lambda.arn
  runtime          = "python3.12"
  handler          = "index.handler"
  filename         = data.archive_file.wakeup.output_path
  source_code_hash = data.archive_file.wakeup.output_base64sha256
  timeout          = 15

  environment {
    variables = {
      ECS_CLUSTER   = aws_ecs_cluster.main.name
      ECS_SERVICE   = aws_ecs_service.mercato.name
      LISTENER_ARN  = aws_lb_listener.https.arn
      ECS_TG_ARN    = aws_lb_target_group.mercato.arn
      WAKEUP_TG_ARN = aws_lb_target_group.wakeup.arn
    }
  }

  tags = local.common_tags
}

resource "aws_lambda_permission" "wakeup_cloudwatch" {
  statement_id  = "AllowCloudWatchAlarm"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.wakeup.function_name
  principal     = "lambda.alarms.cloudwatch.amazonaws.com"
  source_arn    = aws_cloudwatch_metric_alarm.no_healthy_tasks.arn
}

resource "aws_lambda_permission" "wakeup_alb" {
  statement_id  = "AllowALBInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.wakeup.function_name
  principal     = "elasticloadbalancing.amazonaws.com"
  source_arn    = aws_lb_target_group.wakeup.arn
}

resource "aws_lb_target_group_attachment" "wakeup" {
  target_group_arn = aws_lb_target_group.wakeup.arn
  target_id        = aws_lambda_function.wakeup.arn
  depends_on       = [aws_lambda_permission.wakeup_alb]
}

# ─── Watchdog Lambda ──────────────────────────────────────────────────────────
# Triggered by EventBridge every 5 min.
# Checks ALB RequestCount for the last 30 min; scales to 0 if idle.

resource "aws_lambda_function" "watchdog" {
  function_name    = "${var.app_name}-watchdog"
  role             = aws_iam_role.lambda.arn
  runtime          = "python3.12"
  handler          = "index.handler"
  filename         = data.archive_file.watchdog.output_path
  source_code_hash = data.archive_file.watchdog.output_base64sha256
  timeout          = 30

  environment {
    variables = {
      ECS_CLUSTER    = aws_ecs_cluster.main.name
      ECS_SERVICE    = aws_ecs_service.mercato.name
      ALB_ARN_SUFFIX = aws_lb.main.arn_suffix
      TG_ARN_SUFFIX  = aws_lb_target_group.mercato.arn_suffix
      IDLE_MINUTES   = tostring(var.idle_timeout_minutes)
      LISTENER_ARN   = aws_lb_listener.https.arn
      WAKEUP_TG_ARN  = aws_lb_target_group.wakeup.arn
    }
  }

  tags = local.common_tags
}
