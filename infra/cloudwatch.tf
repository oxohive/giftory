resource "aws_cloudwatch_metric_alarm" "no_healthy_tasks" {
  alarm_name          = "${var.app_name}-no-healthy-tasks"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "HealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Average"
  threshold           = 1
  alarm_description   = "Wake ECS when ALB has no healthy targets"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.mercato.arn_suffix
  }

  alarm_actions = [aws_lambda_function.wakeup.arn]

  tags = local.common_tags
}
