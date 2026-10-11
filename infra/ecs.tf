resource "aws_ecs_cluster" "main" {
  name = "${var.app_name}-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "disabled"
  }

  tags = local.common_tags
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE_SPOT", "FARGATE"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
    base              = 0
  }
}

resource "aws_cloudwatch_log_group" "mercato" {
  name              = "/ecs/${var.app_name}-mercato"
  retention_in_days = 7
  tags              = local.common_tags
}

resource "aws_ecs_task_definition" "mercato" {
  family                   = "${var.app_name}-mercato"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 2048
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "mercato"
    image     = "${aws_ecr_repository.mercato.repository_url}:${var.mercato_image_tag}"
    essential = true

    portMappings = [{
      containerPort = 3000
      protocol      = "tcp"
    }]

    secrets = [
      { name = "DATABASE_URL",                        valueFrom = aws_ssm_parameter.database_url.arn },
      { name = "JWT_SECRET",                          valueFrom = aws_ssm_parameter.jwt_secret.arn },
      { name = "AUTH_SECRET",                         valueFrom = aws_ssm_parameter.auth_secret.arn },
      { name = "TENANT_DATA_ENCRYPTION_FALLBACK_KEY", valueFrom = aws_ssm_parameter.tenant_encryption_key.arn },
      { name = "RAZORPAY_KEY_ID",                     valueFrom = aws_ssm_parameter.razorpay_key_id.arn },
      { name = "RAZORPAY_KEY_SECRET",                 valueFrom = aws_ssm_parameter.razorpay_key_secret.arn },
      { name = "RAZORPAY_WEBHOOK_SECRET",             valueFrom = aws_ssm_parameter.razorpay_webhook_secret.arn },
    ]

    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT",     value = "3000" },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.mercato.name
        "awslogs-region"        = local.region
        "awslogs-stream-prefix" = "ecs"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "node -e \"require('http').get('http://localhost:3000/api/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))\""]
      interval    = 30
      timeout     = 10
      retries     = 3
      startPeriod = 60
    }
  }])

  tags = local.common_tags
}

resource "aws_ecs_service" "mercato" {
  name            = "mercato-${var.environment}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.mercato.arn
  desired_count   = 1

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
    base              = 0
  }

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.mercato.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.mercato.arn
    container_name   = "mercato"
    container_port   = 3000
  }

  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 200

  lifecycle {
    # CodeBuild manages desired_count and task_definition after initial deploy
    ignore_changes = [desired_count, task_definition]
  }

  depends_on = [aws_lb_listener.http]

  tags = local.common_tags
}
