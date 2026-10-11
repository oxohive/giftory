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

  # Initial default: wakeup Lambda (ECS starts at 0; Lambda switches to ECS TG once healthy).
  # Watchdog and wakeup manage this at runtime — Tofu must not reset it on every apply.
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.wakeup.arn
  }

  lifecycle {
    ignore_changes = [default_action]
  }

  tags = local.common_tags
}
