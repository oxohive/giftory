resource "aws_lb" "main" {
  name               = "${var.app_name}-dev-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = data.aws_subnets.default.ids

  enable_deletion_protection = false

  tags = local.common_tags
}

resource "aws_lb_target_group" "mercato" {
  name        = "${var.app_name}-mercato-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = data.aws_vpc.default.id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/api/healthz"
    interval            = 30
    timeout             = 10
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = local.common_tags
}

resource "aws_lb_target_group" "wakeup" {
  name        = "${var.app_name}-wakeup-tg"
  target_type = "lambda"
  tags        = local.common_tags
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  # Always redirect plain HTTP to HTTPS.
  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  tags = local.common_tags
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.mercato.certificate_arn

  # Default: reject any request that doesn't match a listener rule.
  # Requests must carry the correct Host header to reach ECS. This prevents internet
  # scanners hitting the ALB by raw IP from counting toward the watchdog's RequestCount.
  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not found"
      status_code  = "400"
    }
  }

  lifecycle {
    ignore_changes = [default_action]
  }

  tags = local.common_tags
}

# Host-scoped rule: only requests for admin.giftory.dev.oxohive.com reach the app.
# Initial action: wakeup Lambda. Wakeup and watchdog Lambdas switch the action
# between wakeup TG and ECS TG at runtime — Tofu must not reset it on every apply.
resource "aws_lb_listener_rule" "mercato" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.wakeup.arn
  }

  condition {
    host_header {
      values = ["${var.api_subdomain}.${var.domain_name}"]
    }
  }

  lifecycle {
    ignore_changes = [action]
  }

  tags = local.common_tags
}
