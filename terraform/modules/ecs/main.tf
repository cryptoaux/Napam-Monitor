locals {
  resource_prefix = "${var.project_name}-${var.environment}"
}

resource "aws_cloudwatch_log_group" "monitor" {
  name              = "/ecs/${local.resource_prefix}"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.monitor.arn

  tags = merge(var.tags, {
    Name = "${local.resource_prefix}-logs"
  })
}

resource "aws_ecs_cluster" "monitor" {
  name = "${local.resource_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = merge(var.tags, {
    Name = "${local.resource_prefix}-cluster"
  })
}

resource "aws_ecs_task_definition" "monitor" {
  family                   = "${local.resource_prefix}-task"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.container_cpu)
  memory                   = tostring(var.container_memory)
  execution_role_arn       = aws_iam_role.ecs_execution.arn

  container_definitions = jsonencode([
    {
      name      = "monitor-app"
      image     = var.container_image
      essential = true
      cpu       = var.container_cpu
      memory    = var.container_memory
      portMappings = [{
        containerPort = 80
        hostPort      = 80
        protocol      = "tcp"
      }]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.monitor.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "monitor"
        }
      }
    }
  ])

  tags = merge(var.tags, {
    Name = "${local.resource_prefix}-task"
  })
}

resource "aws_iam_role" "ecs_execution" {
  name = "${local.resource_prefix}-ecs-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  tags = merge(var.tags, {
    Name = "${local.resource_prefix}-ecs-exec"
  })
}

resource "aws_iam_role_policy" "ecs_execution" {
  name = "${local.resource_prefix}-ecs-policy"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ]
      Resource = [
        aws_cloudwatch_log_group.monitor.arn,
        "${aws_cloudwatch_log_group.monitor.arn}:*"
      ]
    }]
  })
}

resource "aws_kms_key" "monitor" {
  description         = "KMS key for ${local.resource_prefix} CloudWatch logs"
  enable_key_rotation = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowAccountAdministration"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowCloudWatchLogsUse"
        Effect = "Allow"
        Principal = {
          Service = "logs.${var.aws_region}.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey*",
          "kms:ReEncrypt*",
          "kms:DescribeKey"
        ]
        Resource = "*"
        Condition = {
          ArnLike = {
            "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/ecs/${local.resource_prefix}"
          }
        }
      }
    ]
  })

  tags = merge(var.tags, {
    Name = "${local.resource_prefix}-logs-key"
  })
}

resource "aws_ecs_service" "monitor" {
  name            = "${local.resource_prefix}-service"
  cluster         = aws_ecs_cluster.monitor.id
  task_definition = aws_ecs_task_definition.monitor.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = var.security_group_ids
    assign_public_ip = false
  }

  tags = merge(var.tags, {
    Name = "${local.resource_prefix}-service"
  })
}

data "aws_caller_identity" "current" {}
