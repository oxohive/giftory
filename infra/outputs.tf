output "alb_dns_name" {
  description = "ALB DNS — set as NEXT_PUBLIC_API_BASE_URL in Vercel storefront"
  value       = "http://${aws_lb.main.dns_name}"
}

output "ecr_repository_url" {
  description = "ECR repository URL for docker push"
  value       = aws_ecr_repository.mercato.repository_url
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.mercato.name
}

output "codebuild_project_name" {
  description = "CodeBuild project name"
  value       = aws_codebuild_project.mercato.name
}

output "dealer_portal_project_id" {
  description = "Vercel project ID for the dealer portal (apps/dealer-portal)"
  value       = vercel_project.dealer_portal.id
}

output "dealer_portal_url" {
  description = "Dealer portal URL once its domain's DNS/TXT verification is complete"
  value       = "https://${var.dealer_subdomain}.${var.domain_name}"
}
