resource "aws_cloudwatch_event_rule" "watchdog" {
  name                = "${var.app_name}-watchdog-schedule"
  description         = "Trigger watchdog Lambda every 5 min to check idle state"
  schedule_expression = "rate(5 minutes)"
  tags                = local.common_tags
}

resource "aws_cloudwatch_event_target" "watchdog" {
  rule      = aws_cloudwatch_event_rule.watchdog.name
  target_id = "WatchdogLambda"
  arn       = aws_lambda_function.watchdog.arn
}

resource "aws_lambda_permission" "watchdog_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.watchdog.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.watchdog.arn
}
