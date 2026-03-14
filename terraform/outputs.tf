output "discord_interactions_url" {
  description = "Paste this URL into the Discord Developer Portal → Interactions Endpoint URL"
  value       = "${aws_apigatewayv2_stage.default.invoke_url}/discord"
}

output "lambda_function_name" {
  description = "Name of the deployed Lambda function"
  value       = aws_lambda_function.bot.function_name
}
