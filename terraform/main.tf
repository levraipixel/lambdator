# ---------------------------------------------------------------------------
# Lambda package
# The lambda/ directory must have node_modules present before running apply.
# The CI workflow runs `npm ci --production` inside lambda/ first.
# ---------------------------------------------------------------------------
data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda"
  output_path = "${path.module}/../dist/lambda.zip"
  excludes    = ["package-lock.json"]
}

# ---------------------------------------------------------------------------
# IAM
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_exec" {
  name               = "${var.project_name}-lambda-exec"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "basic_execution" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ---------------------------------------------------------------------------
# Lambda function
# ---------------------------------------------------------------------------
resource "aws_lambda_function" "bot" {
  function_name    = var.project_name
  description      = "Serverless Discord bot"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  timeout          = 30
  memory_size      = 128

  environment {
    variables = {
      DISCORD_PUBLIC_KEY          = var.discord_public_key
      DISCORD_BOT_TOKEN           = var.discord_bot_token
      HELLOASSO_CLIENT_ID         = var.helloasso_client_id
      HELLOASSO_CLIENT_SECRET     = var.helloasso_client_secret
      HELLOASSO_ORGANIZATION_SLUG = var.helloasso_organization_slug
      DYNAMODB_TABLE_NAME         = aws_dynamodb_table.membership_orders.name
      REMINDERS_TABLE_NAME        = aws_dynamodb_table.reminders.name
      ALLOWED_DISCORD_USER_IDS    = var.allowed_discord_user_ids
    }
  }
}

# ---------------------------------------------------------------------------
# DynamoDB — membership orders store
# ---------------------------------------------------------------------------
resource "aws_dynamodb_table" "membership_orders" {
  name         = "${var.project_name}-membership-orders"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }
}

resource "aws_iam_role_policy" "lambda_dynamodb" {
  name = "${var.project_name}-lambda-dynamodb"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:PutItem", "dynamodb:Scan"]
      Resource = aws_dynamodb_table.membership_orders.arn
    }]
  })
}

# ---------------------------------------------------------------------------
# DynamoDB — reminders store
# ---------------------------------------------------------------------------
resource "aws_dynamodb_table" "reminders" {
  name         = "${var.project_name}-reminders"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }
}

resource "aws_iam_role_policy" "lambda_dynamodb_reminders" {
  name = "${var.project_name}-lambda-dynamodb-reminders"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:PutItem", "dynamodb:Scan", "dynamodb:DeleteItem"]
      Resource = aws_dynamodb_table.reminders.arn
    }]
  })
}

# ---------------------------------------------------------------------------
# EventBridge Scheduler — hourly reminder check
# ---------------------------------------------------------------------------
resource "aws_iam_role" "scheduler" {
  name = "${var.project_name}-scheduler"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "scheduler_invoke" {
  name = "${var.project_name}-scheduler-invoke"
  role = aws_iam_role.scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = aws_lambda_function.bot.arn
    }]
  })
}

resource "aws_scheduler_schedule" "check_reminders" {
  name = "${var.project_name}-check-reminders"

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression = "rate(10 minutes)"

  target {
    arn      = aws_lambda_function.bot.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ asyncTask = "checkReminders" })
  }
}

resource "aws_iam_role_policy" "lambda_self_invoke" {
  name = "${var.project_name}-lambda-self-invoke"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["lambda:InvokeFunction"]
      Resource = aws_lambda_function.bot.arn
    }]
  })
}

# ---------------------------------------------------------------------------
# HTTP API Gateway (v2) — cheaper and lower-latency than REST API
# ---------------------------------------------------------------------------
resource "aws_apigatewayv2_api" "bot" {
  name          = var.project_name
  protocol_type = "HTTP"
  description   = "Discord interactions endpoint for ${var.project_name}"
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.bot.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.bot.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "discord" {
  api_id    = aws_apigatewayv2_api.bot.id
  route_key = "POST /discord"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.bot.id
  name        = "$default"
  auto_deploy = true
}

# Allow API Gateway to invoke the Lambda function
resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.bot.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.bot.execution_arn}/*/*"
}
