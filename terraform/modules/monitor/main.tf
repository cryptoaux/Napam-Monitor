locals {
  resource_prefix = "${var.project_name}-${var.environment}"
}

resource "aws_vpc" "monitor" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(var.tags, {
    Name = "${local.resource_prefix}-vpc"
  })
}

resource "aws_subnet" "monitor" {
  count = 2

  vpc_id                  = aws_vpc.monitor.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  map_public_ip_on_launch = false
  availability_zone       = data.aws_availability_zones.available.names[count.index]

  tags = merge(var.tags, {
    Name = "${local.resource_prefix}-subnet-${count.index + 1}"
  })
}

resource "aws_internet_gateway" "monitor" {
  vpc_id = aws_vpc.monitor.id

  tags = merge(var.tags, {
    Name = "${local.resource_prefix}-igw"
  })
}

resource "aws_subnet" "nat" {
  count = 2

  vpc_id                  = aws_vpc.monitor.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index + 2)
  map_public_ip_on_launch = false
  availability_zone       = data.aws_availability_zones.available.names[count.index]

  tags = merge(var.tags, {
    Name = "${local.resource_prefix}-nat-subnet-${count.index + 1}"
  })
}

resource "aws_route_table" "nat" {
  vpc_id = aws_vpc.monitor.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.monitor.id
  }

  tags = merge(var.tags, {
    Name = "${local.resource_prefix}-nat-rt"
  })
}

resource "aws_route_table_association" "nat" {
  count          = length(aws_subnet.nat)
  subnet_id      = aws_subnet.nat[count.index].id
  route_table_id = aws_route_table.nat.id
}

resource "aws_eip" "nat" {
  domain = "vpc"

  tags = merge(var.tags, {
    Name = "${local.resource_prefix}-nat-eip"
  })
}

resource "aws_nat_gateway" "monitor" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.nat[0].id

  depends_on = [aws_internet_gateway.monitor]

  tags = merge(var.tags, {
    Name = "${local.resource_prefix}-nat"
  })
}

resource "aws_route_table" "monitor" {
  vpc_id = aws_vpc.monitor.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.monitor.id
  }

  tags = merge(var.tags, {
    Name = "${local.resource_prefix}-rt"
  })
}

resource "aws_route_table_association" "monitor" {
  count          = length(aws_subnet.monitor)
  subnet_id      = aws_subnet.monitor[count.index].id
  route_table_id = aws_route_table.monitor.id
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
            "kms:EncryptionContext:aws:logs:arn" = [
              "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/ecs/${local.resource_prefix}",
              "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/vpc/flow-logs/${local.resource_prefix}"
            ]
          }
        }
      }
    ]
  })

  tags = merge(var.tags, {
    Name = "${local.resource_prefix}-logs-key"
  })
}

resource "aws_cloudwatch_log_group" "flow_logs" {
  name              = "/vpc/flow-logs/${local.resource_prefix}"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.monitor.arn

  tags = merge(var.tags, {
    Name = "${local.resource_prefix}-flow-logs"
  })
}

resource "aws_iam_role" "flow_logs" {
  name = "${local.resource_prefix}-flow-logs"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "vpc-flow-logs.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  tags = merge(var.tags, {
    Name = "${local.resource_prefix}-flow-logs"
  })
}

resource "aws_iam_role_policy" "flow_logs" {
  name = "${local.resource_prefix}-flow-logs-policy"
  role = aws_iam_role.flow_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogStream",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams",
        "logs:PutLogEvents"
      ]
      Resource = "${aws_cloudwatch_log_group.flow_logs.arn}:*"
    }]
  })
}

resource "aws_flow_log" "monitor" {
  vpc_id               = aws_vpc.monitor.id
  traffic_type         = "ALL"
  iam_role_arn         = aws_iam_role.flow_logs.arn
  log_destination_type = "cloud-watch-logs"
  log_destination      = aws_cloudwatch_log_group.flow_logs.arn

  tags = merge(var.tags, {
    Name = "${local.resource_prefix}-flow-log"
  })
}

resource "aws_default_security_group" "monitor" {
  vpc_id = aws_vpc.monitor.id

  ingress = []
  egress  = []

  tags = merge(var.tags, {
    Name = "${local.resource_prefix}-default-sg"
  })
}

resource "aws_ecs_service" "monitor" {
  name            = "${local.resource_prefix}-service"
  cluster         = aws_ecs_cluster.monitor.id
  task_definition = aws_ecs_task_definition.monitor.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.monitor[*].id
    assign_public_ip = false
  }

  tags = merge(var.tags, {
    Name = "${local.resource_prefix}-service"
  })
}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

